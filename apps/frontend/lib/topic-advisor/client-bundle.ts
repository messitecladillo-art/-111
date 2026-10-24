// Only reviewed public content and learned coefficients ship to the browser; training examples stay separate.
import catalog from '../../content/topic-advisor/catalog.json';
import sources from '../../content/topic-advisor/sources.json';
import model from '../../content/topic-advisor/ranker.json';
import events from '../../content/topic-advisor/hotspot-events.json';
import { parseTopicBundle } from './parse.ts';
export const TOPIC_BUNDLE = parseTopicBundle({ catalog, sources, model, events });
