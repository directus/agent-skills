import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORK_DIR, api, check, done, userWithToken } from './lib.mjs';

const psql = (sql) =>
	execFileSync('docker', ['exec', process.env.PG_CONTAINER, 'psql', '-tA', '-U', 'directus', '-d', 'directus', '-c', sql], { encoding: 'utf8' }).trim();
const columns = (table) =>
	psql(`select string_agg(column_name || ':' || data_type, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = '${table}'`);

check(columns('customers') === 'id:uuid,displayName:text,email:text,created_at:timestamp with time zone,updated_at:timestamp with time zone', "customers' columns are unchanged", columns('customers'));
check(columns('invoices') === 'id:integer,customer_id:uuid,status:USER-DEFINED,issued_on:date,updated_at:timestamp with time zone', "invoices' columns are unchanged (status still the enum)", columns('invoices'));
check(columns('invoice_lines') === 'invoice_id:integer,line_no:integer,description:text,amount:numeric', 'invoice_lines is unchanged (no surrogate key added)', columns('invoice_lines'));
check(psql(`select string_agg(enumlabel, ',' order by enumsortorder) from pg_enum where enumtypid = 'invoice_status'::regtype`) === 'draft,sent,paid,void', 'the enum is unchanged');
check(psql(`select count(*) from information_schema.views where table_name = 'invoice_totals'`) === '1', 'the view still exists');
check(psql(`select count(*) from pg_trigger where tgname = 'invoices_touch'`) === '1', 'the trigger still exists');
check(psql('select count(*) from customers') === '2' && psql('select count(*) from invoices') === '2' && psql('select count(*) from invoice_lines') === '4', 'the app data is untouched');

const status = (await api('/fields/invoices/status')).data?.meta;
const choices = (status?.options?.choices ?? []).map((c) => c.value).sort();
check(['select-dropdown', 'select-radio'].includes(status?.interface) && JSON.stringify(choices) === JSON.stringify(['draft', 'paid', 'sent', 'void']), 'status is picked from exactly the enum values', JSON.stringify({ interface: status?.interface, choices }));

const customerField = (await api('/fields/invoices/customer_id')).data?.meta;
const customersMeta = (await api('/collections/customers')).data?.meta;
check(customerField?.interface === 'select-dropdown-m2o', 'an invoice picks its customer (m2o interface)', JSON.stringify(customerField ?? null));
check(/\{\{\s*displayName\s*\}\}/.test(JSON.stringify([customerField?.display_options, customerField?.options, customersMeta?.display_template])), 'invoices show the customer by displayName');

const roles = (await api('/roles?fields=id,name,policies.policy.app_access,policies.policy.admin_access&limit=-1')).data ?? [];
const finance = roles.find((r) => /finance/i.test(r.name));
const policies = (finance?.policies ?? []).map((p) => p.policy).filter(Boolean);
if (!check(!!finance && policies.some((p) => p.app_access) && !policies.some((p) => p.admin_access), 'a Finance role with Studio access and no admin')) done();
await userWithToken(finance.id, 'finance-check-token');
const as = (path, opts = {}) => api(path, { ...opts, token: 'finance-check-token' });

const customer = await as('/items/customers', { method: 'POST', body: { displayName: 'Initech', email: 'pay@initech.test' } });
check(customer.status === 200 && /^[0-9a-f-]{36}$/.test(customer.data?.id ?? ''), 'Finance adds a customer (the database makes the UUID)', `status ${customer.status} ${JSON.stringify(customer.errors ?? customer.data)}`);
const invoice = await as('/items/invoices', { method: 'POST', body: { customer_id: customer.data?.id, status: 'sent' } });
check(invoice.status === 200, 'Finance adds an invoice', `status ${invoice.status} ${JSON.stringify(invoice.errors ?? '')}`);
const bad = await as(`/items/invoices/1`, { method: 'PATCH', body: { status: 'overdue' } });
check(bad.status === 400 && !!bad.errors?.[0]?.message && !/invalid input value for enum|insert into|update "/i.test(bad.errors[0].message), 'an invalid status is a clear 400, not a database error', `status ${bad.status} ${JSON.stringify(bad.errors?.[0])}`);
const named = await as('/items/invoices?fields=id,customer_id.displayName&sort=id&limit=1');
check(named.status === 200 && !!named.data?.[0]?.customer_id?.displayName, 'Finance reads invoices with the customer name', `status ${named.status}`);

const notes = existsSync(join(WORK_DIR, 'NOTES.md')) ? readFileSync(join(WORK_DIR, 'NOTES.md'), 'utf8') : '';
check(/invoice_lines/.test(notes) && /(composite|primary key|single[- ]column key|two columns)/i.test(notes), 'NOTES.md explains invoice_lines (composite primary key)');
check(/invoice_totals/.test(notes) && /\bview/i.test(notes), 'NOTES.md explains invoice_totals (a view)');

done();
