-- ---------------------------------------------------------------------------
-- Credit cards: the second funding rail next to advances.
--
-- The desk already books against cash advances (public.advances): money is
-- received, held as a balance, and drawn down ticket by ticket, with every
-- draw written into a changelog so settlement can be reconstructed. Cards work
-- the same way — a loaded balance that bookings consume and refunds restore —
-- so this mirrors the advance shape on purpose: same balance column, same
-- changelog contract, same RPC semantics. Analytics, the booking screen and
-- the cancellation settlement path can then treat the two rails side by side
-- instead of branching on special cases.
--
-- What is different: a card is identified by its last four digits (we never
-- store a full PAN), it belongs to a bank, it names an approver, and its limit
-- can be raised or lowered later. That last one is why the balance RPC takes
-- p_adjust_limit: a top-up moves the limit AND the available balance, while a
-- booking moves only the available balance.
-- ---------------------------------------------------------------------------

-- Human-readable code, the way advances carry advance_code.
CREATE SEQUENCE IF NOT EXISTS public.credit_card_code_seq START 1;

CREATE TABLE IF NOT EXISTS public.credit_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_code TEXT DEFAULT ('CC-' || LPAD(nextval('public.credit_card_code_seq')::text, 4, '0')),
  -- Last four digits only. The card number itself is never stored.
  last_four TEXT NOT NULL CHECK (last_four ~ '^[0-9]{4}$'),
  bank_name TEXT NOT NULL,
  card_label TEXT,
  approver_name TEXT NOT NULL,
  approver_id UUID REFERENCES public.profiles(id),
  -- opening_balance is the sanctioned limit as it stands today: a later
  -- increase or reduction moves it, so "utilised" is always
  -- opening_balance - amount_left.
  opening_balance NUMERIC NOT NULL,
  amount_left NUMERIC NOT NULL,
  is_active BOOLEAN DEFAULT true,
  comments TEXT,
  changelog JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_cards_active ON public.credit_cards (is_active);

ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;

-- Same readership as advances: the desk and finance, nobody else.
DROP POLICY IF EXISTS "PNC and Finance can view and edit credit cards" ON public.credit_cards;
CREATE POLICY "PNC and Finance can view and edit credit cards" ON public.credit_cards
  FOR ALL USING (
    public.get_user_role() IN ('Admin', 'PNC', 'PNC Admin', 'Finance')
  );

-- ---------------------------------------------------------------------------
-- Link bookings and cancellations to a card
-- ---------------------------------------------------------------------------
ALTER TABLE public.travel_requests
  ADD COLUMN IF NOT EXISTS credit_card_id UUID REFERENCES public.credit_cards(id);

ALTER TABLE public.cancellation_records
  ADD COLUMN IF NOT EXISTS credit_card_id UUID REFERENCES public.credit_cards(id);

-- payment_source gains 'Credit Card'. The column was added inline with an
-- anonymous CHECK, so drop whichever name this database ended up with before
-- re-adding it under a stable one.
ALTER TABLE public.travel_requests DROP CONSTRAINT IF EXISTS travel_requests_payment_source_check;
ALTER TABLE public.travel_requests DROP CONSTRAINT IF EXISTS travel_requests_payment_source_allowed;
ALTER TABLE public.travel_requests
  ADD CONSTRAINT travel_requests_payment_source_allowed
  CHECK (payment_source IN ('Advance', 'Credit Card', 'Direct', 'Not Yet Entered'));

-- ---------------------------------------------------------------------------
-- Atomic card balance update — the advance RPC's twin.
--
-- p_amount_delta is negative for a purchase, positive for a refund or a
-- top-up. p_adjust_limit is true only when the sanctioned limit itself moves
-- (an increase or a reduction recorded by the desk), in which case both the
-- limit and the available balance shift by the same delta so utilisation is
-- unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_credit_card_balance(
  p_card_id UUID,
  p_amount_delta NUMERIC,
  p_changelog_entry JSONB,
  p_adjust_limit BOOLEAN DEFAULT false
) RETURNS NUMERIC AS $$
DECLARE
  v_new_amount NUMERIC;
  v_updated_entry JSONB;
BEGIN
  UPDATE public.credit_cards
  SET
    amount_left = amount_left + p_amount_delta,
    opening_balance = CASE WHEN p_adjust_limit THEN opening_balance + p_amount_delta ELSE opening_balance END,
    updated_at = NOW()
  WHERE id = p_card_id
  RETURNING amount_left INTO v_new_amount;

  v_updated_entry := p_changelog_entry || jsonb_build_object(
    'details',
    (p_changelog_entry->>'details') || ' Available balance: ₹' || v_new_amount || '.'
  );

  UPDATE public.credit_cards
  SET changelog = COALESCE(changelog, '[]'::jsonb) || jsonb_build_array(v_updated_entry)
  WHERE id = p_card_id;

  RETURN v_new_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- The requester guard has to pin the new column too.
--
-- Employees may edit their own request while it is in flight; the guard
-- freezes the fields only the desk owns. credit_card_id is one of those — it
-- moves money — so it joins advance_id in the pinned list. Everything else is
-- carried over verbatim from 20261009110000_pnc_assignment.sql, the latest
-- version of this function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_requester_request_update()
RETURNS TRIGGER AS $guard_requester_request_update$
BEGIN
  IF auth.uid() IS NULL
     OR auth.uid() IS DISTINCT FROM OLD.requester_id
     OR COALESCE(public.get_user_role(), '') IN ('Admin', 'PNC', 'PNC Admin', 'Finance')
  THEN
    RETURN NEW;
  END IF;

  NEW.id              := OLD.id;
  NEW.submission_id   := OLD.submission_id;
  NEW.requester_id    := OLD.requester_id;
  NEW.created_at      := OLD.created_at;

  NEW.approval_status := OLD.approval_status;

  NEW.ticket_cost     := OLD.ticket_cost;
  NEW.invoice_url     := OLD.invoice_url;
  NEW.vendor_name     := OLD.vendor_name;
  NEW.booking_status  := OLD.booking_status;
  NEW.payment_source  := OLD.payment_source;
  NEW.advance_id      := OLD.advance_id;
  NEW.credit_card_id  := OLD.credit_card_id;
  NEW.split_tickets   := OLD.split_tickets;
  NEW.booked_by       := OLD.booked_by;

  -- Desk ownership: assignable only by staff.
  NEW.assigned_pnc_id := OLD.assigned_pnc_id;
  NEW.assigned_at     := OLD.assigned_at;

  RETURN NEW;
END;
$guard_requester_request_update$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_guard_requester_request_update ON public.travel_requests;
CREATE TRIGGER trg_guard_requester_request_update
BEFORE UPDATE ON public.travel_requests
FOR EACH ROW
EXECUTE FUNCTION public.guard_requester_request_update();
