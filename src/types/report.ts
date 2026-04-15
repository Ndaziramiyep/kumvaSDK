export interface Report {
  report_id?: number;
  filter_categories?: string | null;
  time_range_start?: number | null;
  time_range_end?: number | null;
  file_url?: string | null;
  generated: number;
}
