create table if not exists public.workout_sessions (
  id text primary key,
  user_id uuid references auth.users(id) default auth.uid() not null,
  title text not null,
  notes text,
  started_at bigint not null,
  ended_at bigint,
  status text not null,
  total_tonnage numeric default 0,
  total_reps integer default 0,
  pr_count integer default 0,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null,
  deleted_at timestamptz
);

create table if not exists public.session_exercises (
  id text primary key,
  user_id uuid references auth.users(id) default auth.uid() not null,
  workout_session_id text references public.workout_sessions(id) on delete cascade not null,
  exercise_id text not null,
  order_index integer not null default 0,
  notes text,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null,
  deleted_at timestamptz
);

create table if not exists public.exercise_sets (
  id text primary key,
  user_id uuid references auth.users(id) default auth.uid() not null,
  session_exercise_id text references public.session_exercises(id) on delete cascade not null,
  set_index integer not null default 0,
  set_type text not null default 'normal',
  weight numeric not null default 0,
  reps integer not null default 0,
  rpe numeric,
  is_completed boolean not null default false,
  is_pr boolean not null default false,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null,
  deleted_at timestamptz
);
