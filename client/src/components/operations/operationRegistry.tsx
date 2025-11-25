import NoInputRenderer from './renderers/NoInputRenderer';
import SingleChoiceRenderer from './renderers/SingleChoiceRenderer';
import MultiChoiceRenderer from './renderers/MultiChoiceRenderer';
import TextInputRenderer from './renderers/TextInputRenderer';

// A small registry mapping operation names to renderer components and server event names.
export const operationRegistry: Record<string, { renderer: any; eventName?: string }> = {
  // Server-side config includes clientChooses; map common client-chooses ops here
  'confession': { renderer: SingleChoiceRenderer, eventName: 'use-confession' },
  'defector': { renderer: SingleChoiceRenderer, eventName: 'use-defector' },
  'secret intel': { renderer: MultiChoiceRenderer, eventName: 'operation-used' },
  'anonymous tip': { renderer: TextInputRenderer, eventName: 'operation-used' },
  'danish intelligence': { renderer: NoInputRenderer },
  'grudge': { renderer: NoInputRenderer },
  'infatuation': { renderer: NoInputRenderer },
  'sleeper agent': { renderer: NoInputRenderer },
  'old photographs': { renderer: NoInputRenderer },
  'scapegoat': { renderer: NoInputRenderer },
};

export function getOperationEntry(name?: string) {
  if (!name) return undefined;
  const key = name.toLowerCase();
  return operationRegistry[key];
}

export default operationRegistry;
