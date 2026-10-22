export type Auction = {
  id: string;
  number: number;
  title: string;
  description: string;
  currency: string;
  delivery_type: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  step: number;
  anti_snipe_minutes: number;
  is_private: boolean;
  invite_token: string;
};

export type Lot = {
  id: string;
  auction_id: string;
  position: number;
  name: string;
  size: string;
  steel_grade: string;
  volume: string;
  defects: string;
  start_price: number;
  current_price: number | null;
  leader_id: string | null;
  bid_count: number;
};
