export interface PackageRecord {
  name: string;
  display_name: string;
  summary: string;
  description: string;
  author: string;
  license: string;
  classifiers: string[];
  requires_python: string;
  keywords: string;
  version: string;
  home_page?: string;
  updated_at: number;
  downloads_1w?: number;
  downloads_4w?: number;
  trend?: number;
  downloads_52w?: number[];
}
