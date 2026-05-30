import { vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock Supabase query builder — chainable .from().select().eq()... style
// ---------------------------------------------------------------------------
function createQueryMock(override?: Partial<SupabaseQueryMock>) {
  const chain: SupabaseQueryMock = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    textSearch: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    match: vi.fn().mockReturnThis(),
    ...override,
  };

  // Make the chain thenable so it can be awaited
  const thenable = chain as unknown as SupabaseQueryMock & Promise<SupabaseResult>;
  thenable.then = function <TResult1 = SupabaseResult, TResult2 = never>(
    onfulfilled?: ((value: SupabaseResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const result: SupabaseResult = { data: null, error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  };

  return thenable;
}

export interface SupabaseQueryMock {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  gt: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  textSearch: ReturnType<typeof vi.fn>;
  filter: ReturnType<typeof vi.fn>;
  match: ReturnType<typeof vi.fn>;
}

export interface SupabaseResult {
  data: unknown;
  error: unknown;
}

export interface SupabaseClientMock {
  from: ReturnType<typeof vi.fn>;
  auth: {
    getUser: ReturnType<typeof vi.fn>;
  };
}

export function createSupabaseMock(): SupabaseClientMock {
  const fromMock = vi.fn((_table: string) => createQueryMock());
  return {
    from: fromMock,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user-123" } }, error: null }),
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: create a query mock that returns specific data
// ---------------------------------------------------------------------------
export function mockQueryResult<T>(data: T, error: unknown = null) {
  const result: SupabaseResult = { data, error };
  const chain = createQueryMock();
  const thenable = chain as unknown as SupabaseQueryMock & Promise<SupabaseResult>;
  thenable.then = ((onfulfilled, onrejected) =>
    Promise.resolve(result).then(onfulfilled, onrejected)) as Promise<SupabaseResult>["then"];
  return thenable;
}

// ---------------------------------------------------------------------------
// Pre-configured mocks for common modules
// ---------------------------------------------------------------------------
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
    set: vi.fn(),
  }),
  headers: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/dashboard/revalidate-dashboard", () => ({
  revalidateDashboardSegments: vi.fn(),
}));

vi.mock("@/lib/analytics/product-events", () => ({
  trackProductEvent: vi.fn(),
}));

vi.mock("@/lib/email/resend", () => ({
  sendEmailWithResend: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helper: create a thenable query chain from an override map
// Any method not in the override returns mockReturnThis()
// The chain implicitly resolves to { data: null, error: null } when awaited
// ---------------------------------------------------------------------------
export function chainableQuery(overrides: Record<string, unknown> = {}) {
  const base: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    ...overrides,
  };

  const chain = base as typeof base & Promise<SupabaseResult>;
  chain.then = ((onfulfilled, onrejected) =>
    Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected)) as Promise<SupabaseResult>["then"];
  return chain;
}

// A full supabase client stub — from() returns a chainable query stub
export function supabaseStub(): any {
  return {
    from: vi.fn(() => chainableQuery()),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user-123" } }, error: null }),
    },
  };
}

vi.mock("@/lib/dashboard/auth-server", () => ({
  requireShopId: vi.fn(),
  canAccessShopId: vi.fn(),
  createServiceRoleClient: vi.fn(),
  getAuthSession: vi.fn(),
  getCachedUser: vi.fn(),
}));
