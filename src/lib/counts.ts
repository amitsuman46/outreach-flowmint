export type DeskCounts = {
  /** "With PPT" leads still in play. */
  gathered: number;
  /** Every "With PPT" lead on the Leads page, sent and replied included. */
  leads: number;
  rejected: number;
  /** "With PPT" drafts waiting for review. */
  drafted: number;
  /** The "Without PPT" workflow. */
  template: { gathered: number; drafted: number; leads: number };
  /** Leads that were emailed, replied or not. */
  contacted: number;
  /** Messages in the Hostinger Sent folder. */
  sent: number;
  replies: number;
  /** Follow-ups that are due and waiting for you to send them. */
  followUps: number;
  total: number;
};
