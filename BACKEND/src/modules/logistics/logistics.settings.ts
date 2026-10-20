// Logistics business rules. These move into the `settings` table (editable by admins) in a later step.
export const LOGISTICS_SETTINGS = {
  maxActiveJobsPerRider: 3, // a rider can carry at most this many jobs at once
  defaultRiderFeeCents: 200_00, // when no delivery zone matches the area
  maxCodeAttempts: 5, // wrong collection codes / delivery OTPs before the code locks
  codHandoverHours: 24, // BR-006: COD cash must be handed in within 24 hours
} as const;
