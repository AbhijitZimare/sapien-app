export interface AdminOverviewStats {
  weeklyMessages: number
  cacheHitRate: number | null
  thumbsUpRate: number | null
  weeklyCost: number
}

export interface AdminMatrixRow {
  prompt_key: string
  message_count: number
  avg_input: number | null
  avg_output: number | null
  thumbs_up: number
  thumbs_down: number
  thumbs_up_rate: number | null
  cost_per_useful: number | null
}

export interface AdminDailyActivity {
  date: string
  messages: number
  cacheHits: number
}

export interface AdminStatsResponse {
  overview: AdminOverviewStats
  matrixRows: AdminMatrixRow[]
  dailyActivity: AdminDailyActivity[]
}
