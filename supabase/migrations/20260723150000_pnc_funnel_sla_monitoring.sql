-- MIGRATION: PNC FUNNEL & SLA MONITORING LAYER

-- 1. Trigger function to record status transitions in ticket_status_history
CREATE OR REPLACE FUNCTION record_ticket_status_history()
RETURNS TRIGGER AS $$
DECLARE
    actor_id UUID;
    actor_role TEXT;
BEGIN
    -- Try to retrieve actor details from auth context
    actor_id := auth.uid();
    IF actor_id IS NOT NULL THEN
        SELECT role INTO actor_role FROM public.profiles WHERE id = actor_id;
    END IF;

    -- Record status history
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.ticket_status_history (
            ticket_id,
            from_status,
            to_status,
            actor_id,
            actor_role,
            reason,
            created_at
        ) VALUES (
            NEW.id,
            NULL,
            NEW.pnc_status,
            actor_id,
            actor_role,
            NULL,
            NOW()
        );
    ELSIF TG_OP = 'UPDATE' AND (OLD.pnc_status IS DISTINCT FROM NEW.pnc_status) THEN
        INSERT INTO public.ticket_status_history (
            ticket_id,
            from_status,
            to_status,
            actor_id,
            actor_role,
            reason,
            created_at
        ) VALUES (
            NEW.id,
            OLD.pnc_status,
            NEW.pnc_status,
            actor_id,
            actor_role,
            NEW.status_change_reason,
            NOW()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Trigger on travel_requests
DROP TRIGGER IF EXISTS trg_record_ticket_status_history ON public.travel_requests;
CREATE TRIGGER trg_record_ticket_status_history
AFTER INSERT OR UPDATE ON public.travel_requests
FOR EACH ROW
EXECUTE FUNCTION record_ticket_status_history();

-- 2. Retrospective population of ticket_status_history from existing timeline JSON
CREATE OR REPLACE FUNCTION populate_status_history_from_timeline()
RETURNS void AS $$
DECLARE
    req RECORD;
    t_event JSONB;
    prev_status TEXT;
    curr_status TEXT;
    evt_time TIMESTAMPTZ;
    evt_actor TEXT;
    evt_details TEXT;
    actor_id UUID;
    actor_role TEXT;
BEGIN
    FOR req IN SELECT id, timeline, created_at, pnc_status, requester_name FROM public.travel_requests LOOP
        -- Skip if history already populated
        IF EXISTS (SELECT 1 FROM public.ticket_status_history WHERE ticket_id = req.id) THEN
            CONTINUE;
        END IF;

        -- First insert for 'Not Started'
        INSERT INTO public.ticket_status_history (
            ticket_id,
            from_status,
            to_status,
            created_at
        ) VALUES (
            req.id,
            NULL,
            'Not Started',
            req.created_at
        );
        prev_status := 'Not Started';

        -- Parse timeline
        IF req.timeline IS NOT NULL AND jsonb_typeof(req.timeline) = 'array' THEN
            FOR t_event IN SELECT * FROM jsonb_array_elements(req.timeline) LOOP
                IF t_event->>'event' LIKE 'Status changed to:%' THEN
                    curr_status := trim(replace(t_event->>'event', 'Status changed to:', ''));
                    evt_time := (t_event->>'timestamp')::TIMESTAMPTZ;
                    evt_actor := t_event->>'actor';
                    evt_details := t_event->>'details';

                    SELECT id, role INTO actor_id, actor_role FROM public.profiles WHERE name = evt_actor LIMIT 1;

                    INSERT INTO public.ticket_status_history (
                        ticket_id,
                        from_status,
                        to_status,
                        actor_id,
                        actor_role,
                        reason,
                        created_at
                    ) VALUES (
                        req.id,
                        prev_status,
                        curr_status,
                        actor_id,
                        actor_role,
                        evt_details,
                        evt_time
                    );
                    prev_status := curr_status;
                END IF;
            END LOOP;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Execute retrospective population
SELECT populate_status_history_from_timeline();
DROP FUNCTION populate_status_history_from_timeline();

-- 3. Create SLA configuration table
CREATE TABLE IF NOT EXISTS public.sla_configs (
  stage TEXT PRIMARY KEY,
  target_hours INTEGER NOT NULL,
  escalation_hours INTEGER NOT NULL,
  owner_role TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed defaults
INSERT INTO public.sla_configs (stage, target_hours, escalation_hours, owner_role) VALUES
  ('Approval Pending', 24, 48, 'Manager'),
  ('Processing', 48, 96, 'PNC'),
  ('Booked', 72, 144, 'PNC'),
  ('On Hold', 48, 96, 'Employee')
ON CONFLICT (stage) DO UPDATE SET
  target_hours = EXCLUDED.target_hours,
  escalation_hours = EXCLUDED.escalation_hours,
  owner_role = EXCLUDED.owner_role;

-- Enable RLS
ALTER TABLE public.sla_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Anyone can read SLA configs" ON public.sla_configs;
CREATE POLICY "Anyone can read SLA configs" ON public.sla_configs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage SLA configs" ON public.sla_configs;
CREATE POLICY "Admins can manage SLA configs" ON public.sla_configs
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')
  );

-- 4. Add SLA fields to travel_requests
ALTER TABLE public.travel_requests
  ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS escalation_fired BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sla_breached_at TIMESTAMPTZ;

-- 5. SLA Breach Detection Function
CREATE OR REPLACE FUNCTION public.check_sla_breaches()
RETURNS void AS $$
DECLARE
    req RECORD;
    config RECORD;
    latest_hist RECORD;
    elapsed_hours DOUBLE PRECISION;
BEGIN
    FOR req IN 
        SELECT id, pnc_status, created_at 
        FROM public.travel_requests 
        WHERE pnc_status NOT IN ('Closed', 'Rejected by Manager', 'Rejected by PNC', 'Cancelled by Employee', 'Cancelled by PNC')
    LOOP
        SELECT target_hours, escalation_hours INTO config 
        FROM public.sla_configs 
        WHERE stage = req.pnc_status;
        
        IF config IS NOT NULL THEN
            SELECT created_at INTO latest_hist 
            FROM public.ticket_status_history 
            WHERE ticket_id = req.id AND to_status = req.pnc_status 
            ORDER BY created_at DESC LIMIT 1;
            
            IF latest_hist IS NULL THEN
                latest_hist := req.created_at;
            END IF;
            
            elapsed_hours := EXTRACT(EPOCH FROM (NOW() - latest_hist.created_at)) / 3600;
            
            IF elapsed_hours >= config.target_hours THEN
                UPDATE public.travel_requests
                SET sla_breached = TRUE,
                    sla_breached_at = COALESCE(sla_breached_at, NOW())
                WHERE id = req.id;
                
                IF elapsed_hours >= config.escalation_hours THEN
                    UPDATE public.travel_requests
                    SET escalation_fired = TRUE
                    WHERE id = req.id;
                END IF;
            ELSE
                UPDATE public.travel_requests
                SET sla_breached = FALSE,
                    sla_breached_at = NULL,
                    escalation_fired = FALSE
                WHERE id = req.id;
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. get_flowchart_edges function to fetch grouped status transition links
CREATE OR REPLACE FUNCTION public.get_flowchart_edges(start_time TIMESTAMPTZ, end_time TIMESTAMPTZ)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'edges', COALESCE(
            json_agg(
                json_build_object(
                    'from', from_status_mapped,
                    'to', to_status_mapped,
                    'count', transition_count
                )
            ),
            '[]'::json
        )
    ) INTO result
    FROM (
        SELECT 
            CASE 
                WHEN from_status IS NULL OR from_status = 'Not Started' OR from_status = 'Created' THEN 'Received' 
                ELSE from_status 
            END as from_status_mapped,
            CASE 
                WHEN to_status = 'Not Started' THEN 'Received'
                ELSE to_status 
            END as to_status_mapped,
            count(*)::integer as transition_count
        FROM public.ticket_status_history
        WHERE (created_at >= start_time OR start_time IS NULL)
          AND (created_at <= end_time OR end_time IS NULL)
        GROUP BY from_status_mapped, to_status_mapped
        HAVING count(*)::integer > 0 
           AND CASE 
                WHEN from_status IS NULL OR from_status = 'Not Started' OR from_status = 'Created' THEN 'Received' 
                ELSE from_status 
               END IS DISTINCT FROM 
               CASE 
                WHEN to_status = 'Not Started' THEN 'Received'
                ELSE to_status 
               END
        ORDER BY transition_count DESC
    ) sub;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
