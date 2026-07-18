export interface PackageRecord {
  name: string;
  display_name: string;
  summary: string;
  version: string;
  home_page?: string;
  updated_at: number;
  downloads_1w?: number;
  downloads_4w?: number;
  trend?: number;
  downloads_52w?: number[];
}
