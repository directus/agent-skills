import { api, check, done } from './lib.mjs';

// The agent's ids aren't known up front, so check stable facts:
// one row per language per post, no orphaned junction rows, block and junction rows kept.
const get = async (path) => (await api(path)).data ?? [];
const hello = (await get('/items/posts?filter[title][_eq]=Hello%20World&fields=id,translations.id,translations.languages_code,translations.title,translations.content'))[0];
const rows = hello?.translations ?? [];
const de = rows.filter((t) => t.languages_code === 'de-DE');
const fr = rows.filter((t) => t.languages_code === 'fr-FR');
const en = rows.filter((t) => t.languages_code === 'en-US');
check(de.length === 1 && de[0].title === 'Hallo Welt', 'the German title is fixed, still one German row', JSON.stringify(de));
check(fr.length === 1 && fr[0].title === 'Bonjour le monde' && /Premier/.test(fr[0].content ?? ''), 'a French translation was added', JSON.stringify(fr));
check(en.length === 1 && en[0].title === 'Hello World', 'the English translation is untouched', JSON.stringify(en));
const orphanTranslations = await get('/items/posts_translations?filter[posts][_null]=true&fields=id');
check(orphanTranslations.length === 0, 'no translation rows were orphaned (re-sent without ids)', `${orphanTranslations.length} orphaned`);

const second = (await get('/items/posts?filter[title][_eq]=Second%20Post&fields=tags.id,tags.tag.name'))[0];
const names = (second?.tags ?? []).map((t) => t.tag?.name).sort();
check(JSON.stringify(names) === JSON.stringify(['Guides', 'News', 'Release']), 'Second Post has Guides, News, and Release, once each', JSON.stringify(names));
const orphanTags = await get('/items/post_tags?filter[_or][0][post][_null]=true&filter[_or][1][tag][_null]=true&fields=id');
check(orphanTags.length === 0, 'no tag links were orphaned', `${orphanTags.length} orphaned`);
const tagCount = (await get('/items/tags?aggregate[count]=*'))[0]?.count;
check(Number(tagCount) === 3, 'no duplicate tags were created', String(tagCount));

const about = (await get('/items/pages?filter[permalink][_eq]=/about&fields=id,blocks.id,blocks.collection,blocks.item:block_hero.headline,blocks.item:block_hero.tagline,blocks.item:block_richtext.body'))[0];
const blocks = about?.blocks ?? [];
const hero = blocks.find((b) => b.collection === 'block_hero');
check(hero?.item?.headline === 'Built for teams', 'the hero headline is updated', JSON.stringify(hero));
check(hero?.item?.tagline === 'Who we are', "the hero's other fields are kept", JSON.stringify(hero?.item));
check(blocks.length === 2 && blocks.some((b) => b.collection === 'block_richtext' && /We build things/.test(b.item?.body ?? '')), 'the page still has its two blocks', JSON.stringify(blocks.map((b) => b.collection)));
const heroes = (await get('/items/block_hero?aggregate[count]=*'))[0]?.count;
const orphanBlocks = await get('/items/page_blocks?filter[page][_null]=true&fields=id');
check(Number(heroes) === 1 && orphanBlocks.length === 0, 'the block was edited in place (no new hero, no orphaned page_blocks)', `heroes ${heroes}, orphaned ${orphanBlocks.length}`);

const draft = (await get('/items/posts?filter[title][_eq]=Secret%20Draft&fields=status'))[0];
check(draft?.status === 'published', '"Secret Draft" is published', draft?.status);

done();
