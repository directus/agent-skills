-- A harder existing database: a Postgres enum, a UUID key with a database default, a camelCase column, a trigger,
-- a composite-key table, and a view. The app owns all of it.
create extension if not exists pgcrypto;
create type invoice_status as enum ('draft', 'sent', 'paid', 'void');
create table customers (
	id uuid primary key default gen_random_uuid(),
	"displayName" text not null,
	email text unique,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create table invoices (
	id serial primary key,
	customer_id uuid not null references customers(id),
	status invoice_status not null default 'draft',
	issued_on date not null default current_date,
	updated_at timestamptz not null default now()
);
create table invoice_lines (
	invoice_id integer not null references invoices(id) on delete cascade,
	line_no integer not null,
	description text not null,
	amount numeric(10,2) not null,
	primary key (invoice_id, line_no)
);
create function touch() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger invoices_touch before update on invoices for each row execute function touch();
create view invoice_totals as
	select i.id as invoice_id, c."displayName" as customer, sum(l.amount) as total
	from invoices i join customers c on c.id = i.customer_id left join invoice_lines l on l.invoice_id = i.id
	group by i.id, c."displayName";
insert into customers ("displayName", email) values ('Acme', 'billing@acme.test'), ('Globex', 'ap@globex.test');
insert into invoices (customer_id, status) select id, 'sent' from customers;
insert into invoice_lines select i.id, n, 'Line ' || n, 100 * n from invoices i, generate_series(1, 2) n;
