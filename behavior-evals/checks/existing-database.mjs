import { execFileSync } from 'node:child_process';
import { api, check, done, userWithToken } from './lib.mjs';

const psql = (sql) =>
	execFileSync('docker', ['exec', process.env.PG_CONTAINER, 'psql', '-tA', '-U', 'directus', '-d', 'directus', '-c', sql], { encoding: 'utf8' }).trim();
const columns = (table) => psql(`select string_agg(column_name || ':' || data_type, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = '${table}'`);

check(columns('customers') === 'id:integer,name:text,email:text,created_at:timestamp with time zone', "customers' columns are unchanged", columns('customers'));
check(columns('invoices') === 'id:integer,customer_id:integer,amount:numeric,issued_on:date,paid:boolean', "invoices' columns are unchanged", columns('invoices'));
check(columns('legacy_audit') === 'logged_at:timestamp with time zone,message:text', "legacy_audit is unchanged (no key added)", columns('legacy_audit'));
check(psql('select count(*) from customers') === '3' && psql('select count(*) from invoices') === '4', 'the app data is untouched');
check(psql(`select count(*) from information_schema.table_constraints where table_name = 'invoices' and constraint_type = 'FOREIGN KEY'`) === '1', "the app's foreign key is still there");

// Collection and relation meta rows are optional: Directus reads the existing tables and foreign key without them.
const meta = async (c) => (await api(`/collections/${c}`)).data?.meta;
const rel = ((await api('/relations/invoices')).data ?? []).find((r) => r.field === 'customer_id');
check(rel?.related_collection === 'customers', 'invoices.customer_id relates to customers in Directus', JSON.stringify(rel ?? null));
const field = (await api('/fields/invoices/customer_id')).data?.meta;
check(field?.interface === 'select-dropdown-m2o', 'the invoice form picks a customer (m2o interface)', JSON.stringify(field ?? null));
check(/\{\{\s*name\s*\}\}/.test(JSON.stringify([field?.display_options, field?.options, (await meta('customers'))?.display_template])), 'invoices show the customer by name', JSON.stringify({ display: field?.display_options, template: (await meta('customers'))?.display_template }));

const roles = (await api('/roles?fields=id,name,policies.policy.app_access,policies.policy.admin_access&limit=-1')).data ?? [];
const finance = roles.find((r) => /finance/i.test(r.name));
const policies = (finance?.policies ?? []).map((p) => p.policy).filter(Boolean);
if (!check(!!finance && policies.some((p) => p.app_access) && !policies.some((p) => p.admin_access), 'a Finance role with Studio access and no admin')) done();
await userWithToken(finance.id, 'finance-check-token');
const as = (path, opts = {}) => api(path, { ...opts, token: 'finance-check-token' });

const list = await as('/items/invoices?fields=id,amount,customer_id.name&sort=id');
check(list.status === 200 && list.data?.[0]?.customer_id?.name === 'Acme', 'Finance reads invoices with the customer name', `status ${list.status} ${JSON.stringify(list.data?.[0] ?? list.errors)}`);
const pay = await as('/items/invoices/2', { method: 'PATCH', body: { paid: true } });
check(pay.status === 200 && psql('select paid from invoices where id = 2') === 't', 'Finance can mark an invoice paid', `status ${pay.status}`);
const editCustomer = await as('/items/customers/1', { method: 'PATCH', body: { name: 'Hacked' } });
check(editCustomer.status === 403, 'Finance cannot edit customers', `status ${editCustomer.status}`);
const del = await as('/items/invoices/3', { method: 'DELETE' });
check(del.status === 403, 'Finance cannot delete invoices', `status ${del.status}`);

done();
