// Mock Supabase client for development when environment variables are missing
export const mockSupabase = {
  from: (table: string) => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: null, error: null }),
        data: [],
        error: null,
      }),
      data: [],
      error: null,
    }),
    insert: () => ({ data: null, error: null }),
    update: () => ({ data: null, error: null }),
    delete: () => ({ data: null, error: null }),
  }),
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
  },
}
