export type DeskCounts = {
  gathered: number;
  rejected: number;
  /** Drafts waiting for review. */
  drafted: number;
  /** Leads that were emailed, replied or not. */
  contacted: number;
  /** Messages in the Hostinger Sent folder. */
  sent: number;
  replies: number;
  total: number;
};
