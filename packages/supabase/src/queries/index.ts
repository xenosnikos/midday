import { Client } from "../types";

export function getPagination(page: number, size: number) {
  const limit = size ? +size : 3;
  const from = page ? page * limit : 0;
  const to = page ? from + size - 1 : size - 1;

  return { from, to };
}

export async function getSession(supabase: Client) {
  return supabase.auth.getSession();
}

export async function getCurrentUser(supabase: Client) {
  const { data } = await getSession(supabase);

  return supabase
    .from("users")
    .select(`
      *,
      team:team_id(*)
    `)
    .eq("id", data?.session?.user.id)
    .single();
}

export async function getUserTeams(supabase: Client) {
  const { data: userData } = await getCurrentUser(supabase);

  return supabase
    .from("members")
    .select(`
      *,
      team:teams(*)
    `)
    .eq("team_id", userData?.team_id);
}

export async function getTeamBankConnections(supabase: Client) {
  const { data: userData } = await getCurrentUser(supabase);

  return supabase
    .from("bank_connections")
    .select("*")
    .eq("team_id", userData?.team_id);
}

export async function getTeamBankAccounts(supabase: Client) {
  const { data: userData } = await getCurrentUser(supabase);

  return supabase
    .from("bank_accounts")
    .select("*, bank:bank_connection_id(*)")
    .eq("team_id", userData?.team_id);
}

export async function getTeamMembers(supabase: Client) {
  const { data: userData } = await getCurrentUser(supabase);

  const { data } = await supabase
    .from("users_on_team")
    .select(`
      id,
      user:users(id,full_name,avatar_url)
    `)
    .eq("team_id", userData?.team_id);

  return data;
}

type GetSpendingParams = {
  from: number;
  to: number;
};

export async function getSpending(supabase: Client, params: GetSpendingParams) {
  const { from, to } = params;

  const query = supabase
    .from("transactions")
    .select(
      `
      *,
      currency,
      category,
      amount,
    `,
    )
    .order("order")
    .eq("team_id", userData?.team_id);

  if (from && to) {
    query.gte("date", from);
    query.lte("date", to);
  }

  const { data, count } = await query.range(0, 100000);

  const totalAmount = data?.reduce((amount, item) => item.amount + amount, 0);

  return {
    meta: {
      count,
      totalAmount,
      currency: data?.at(0)?.currency,
    },
    data,
  };
}

type GetTransactionsParams = {
  teamId: string;
  from: number;
  to: number;
  sort: {
    column: string;
    value: "asc" | "desc";
  };
  filter: {
    search?: string;
    status?: "fullfilled" | "unfullfilled";
    attachments?: "include" | "exclude";
    category?: "include" | "exclude";
    date: {
      from?: string;
      to?: string;
    };
  };
};

export async function getTransactions(
  supabase: Client,
  params: GetTransactionsParams,
) {
  const { from = 0, to, filter, sort, teamId } = params;
  const { date = {}, search, status, attachments, category } = filter || {};

  const query = supabase
    .from("transactions")
    .select(
      `
      *,
      currency
      assigned:assigned_id(*),
      attachments(id,size,name)
    `,
      { count: "exact" },
    )
    .eq("team_id", teamId);

  if (sort) {
    const [column, value] = sort;
    query.order(column, { ascending: value === "asc" });
  } else {
    query.order("order");
  }

  if (date?.from && date?.to) {
    query.gte("date", date.from);
    query.lte("date", date.to);
  }

  if (search) {
    query.textSearch("name", search, {
      type: "websearch",
      config: "english",
    });
  }

  if (status?.includes("fullfilled")) {
    query.not("attachment", "is", null);
    query.not("vat", "is", null);
  }

  if (status?.includes("unfullfilled")) {
    query.is("attachment", null);
    query.is("vat", null);
  }

  if (attachments === "exclude") {
    query.is("attachment", null);
  }

  if (attachments === "include") {
    query.not("attachment", "is", null);
  }

  if (category === "exclude") {
    query.is("category", null);
  }

  if (category === "include") {
    query.not("category", "is", null);
  }

  const { data, count } = await query.range(from, to);

  // Only calculate total amount when a fitler is applied
  // Investigate pg functions
  const totalAmount = filter
    ? (await query.limit(10000000))?.data?.reduce(
        (amount, item) => item.amount + amount,
        0,
      )
    : 0;

  return {
    meta: {
      count,
      totalAmount,
      currency: data?.at(0)?.currency,
    },
    data,
  };
}

export async function getTransaction(supabase: Client, id: string) {
  return supabase
    .from("transactions")
    .select(`
      *,
      account:bank_account_id(*),
      assigned:assigned_id(*),
      attachments(*)
    `)
    .eq("id", id)
    .single();
}

export async function getSimilarTransactions(supabase: Client, id: string) {
  const { data: userData } = await getCurrentUser(supabase);

  const transaction = await supabase
    .from("transactions")
    .select("name, category")
    .eq("id", id)
    .single();

  return supabase
    .from("transactions")
    .select("id, amount", { count: "exact" })
    .eq("name", transaction.data.name)
    .eq("team_id", userData?.team_id)
    .is("category", null);
}
