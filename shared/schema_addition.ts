export type AccountStrategy = {
  id?: string;
  engagementObjective?: string | null;
  messagingAngle?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export type BuyingCommitteeMember = {
  id?: string;
  accountId?: string;
  contactId?: string | null;
  role?: string;
  name?: string | null;
  title?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};
