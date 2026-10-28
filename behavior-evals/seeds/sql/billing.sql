-- An existing app's billing tables, created before Directus first boots. The app owns this schema.
create table customers (id serial primary key, name text not null, email text unique, created_at timestamptz default now());
create table invoices (
	id serial primary key,
	customer_id integer not null references customers(id),
	amount numeric(10,2) not null,
	issued_on date not null,
	paid boolean not null default false
);
create table legacy_audit (logged_at timestamptz default now(), message text);
insert into customers (name, email) values ('Acme', 'billing@acme.test'), ('Globex', 'ap@globex.test'), ('Initech', 'pay@initech.test');
insert into invoices (customer_id, amount, issued_on, paid) values
	(1, 1200, '2026-09-01', true), (1, 340.5, '2026-10-01', false), (2, 99, '2026-10-05', false), (3, 2500, '2026-10-10', false);
insert into legacy_audit (message) values ('created'), ('migrated');
