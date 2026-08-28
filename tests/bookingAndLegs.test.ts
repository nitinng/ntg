import { describe, it, expect } from 'vitest';
import { TravelLeg, TravelMode, TravelRequest, PNCStatus, Priority, ApprovalStatus, TripType } from '../types';

/**
 * Pure helper function simulating booking status aggregation from multi-leg travel tickets.
 */
export const deriveBookingStatusFromLegs = (legs?: TravelLeg[]): 'Booked' | 'Partially Cancelled' | 'Cancelled' | 'Not Booked' => {
  if (!legs || legs.length === 0) return 'Not Booked';

  const activeLegs = legs.filter(l => l.status === 'Active');
  const cancelledLegs = legs.filter(l => l.status === 'Cancelled');

  if (activeLegs.length === legs.length) return 'Booked';
  if (cancelledLegs.length === legs.length) return 'Cancelled';
  return 'Partially Cancelled';
};

/**
 * Helper to compute total booked cost across active/cancelled legs.
 */
export const computeTotalTicketCost = (legs?: TravelLeg[]): { totalCost: number; activeCost: number; cancelledCost: number } => {
  if (!legs || legs.length === 0) return { totalCost: 0, activeCost: 0, cancelledCost: 0 };

  const totalCost = legs.reduce((sum, leg) => sum + (leg.ticketCost || 0), 0);
  const activeCost = legs.filter(l => l.status === 'Active').reduce((sum, l) => sum + (l.ticketCost || 0), 0);
  const cancelledCost = legs.filter(l => l.status === 'Cancelled').reduce((sum, l) => sum + (l.ticketCost || 0), 0);

  return { totalCost, activeCost, cancelledCost };
};

describe('Booking & Travel Legs Invariants', () => {
  const sampleLegs: TravelLeg[] = [
    {
      id: 'leg-1',
      travelRequestId: 'req-1',
      fromLocation: 'Delhi',
      toLocation: 'Mumbai',
      travelMode: TravelMode.FLIGHT,
      vendorName: 'Air India',
      ticketCost: 4500,
      status: 'Active'
    },
    {
      id: 'leg-2',
      travelRequestId: 'req-1',
      fromLocation: 'Mumbai',
      toLocation: 'Pune',
      travelMode: TravelMode.TRAIN,
      vendorName: 'IRCTC',
      ticketCost: 800,
      status: 'Active'
    }
  ];

  it('marks overall booking as Booked when all legs are Active', () => {
    expect(deriveBookingStatusFromLegs(sampleLegs)).toBe('Booked');
  });

  it('marks booking as Partially Cancelled when only one leg is cancelled', () => {
    const mixedLegs: TravelLeg[] = [
      { ...sampleLegs[0], status: 'Active' },
      { ...sampleLegs[1], status: 'Cancelled', cancelledBy: 'Employee', cancellationReason: 'Meeting rescheduled' }
    ];

    expect(deriveBookingStatusFromLegs(mixedLegs)).toBe('Partially Cancelled');
  });

  it('marks booking as Cancelled when all legs are Cancelled', () => {
    const allCancelled: TravelLeg[] = sampleLegs.map(leg => ({
      ...leg,
      status: 'Cancelled',
      cancelledBy: 'Org'
    }));

    expect(deriveBookingStatusFromLegs(allCancelled)).toBe('Cancelled');
  });

  it('computes total, active, and cancelled costs accurately without discrepancies', () => {
    const mixedLegs: TravelLeg[] = [
      { ...sampleLegs[0], ticketCost: 4500, status: 'Active' },
      { ...sampleLegs[1], ticketCost: 800, status: 'Cancelled' }
    ];

    const costs = computeTotalTicketCost(mixedLegs);
    expect(costs.totalCost).toBe(5300);
    expect(costs.activeCost).toBe(4500);
    expect(costs.cancelledCost).toBe(800);
    expect(costs.activeCost + costs.cancelledCost).toBe(costs.totalCost);
  });

  it('handles empty or missing legs array safely', () => {
    expect(deriveBookingStatusFromLegs([])).toBe('Not Booked');
    expect(deriveBookingStatusFromLegs(undefined)).toBe('Not Booked');

    expect(computeTotalTicketCost([])).toEqual({ totalCost: 0, activeCost: 0, cancelledCost: 0 });
    expect(computeTotalTicketCost(undefined)).toEqual({ totalCost: 0, activeCost: 0, cancelledCost: 0 });
  });
});
