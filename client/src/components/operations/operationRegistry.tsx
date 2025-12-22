import NoInputRenderer from './renderers/NoInputRenderer';
import SingleChoiceRenderer from './renderers/SingleChoiceRenderer';
import MultiChoiceRenderer from './renderers/MultiChoiceRenderer';
// Text input renderer no longer used for operations

// A small registry mapping operation names to renderer components and server event names.
export const operationRegistry: Record<string, { renderer: any; eventName?: string }> = {
  // Server-side config includes clientChooses; map common client-chooses ops here
  'confession': { renderer: SingleChoiceRenderer, eventName: 'use-confession' },
  'defector': { renderer: SingleChoiceRenderer, eventName: 'use-defector' },
  'secret intel': { renderer: NoInputRenderer, eventName: 'operation-used' },
  // Anonymous tip requires no input; deliver privately
  'anonymous tip': { renderer: NoInputRenderer, eventName: 'operation-used' },
  'danish intelligence': { renderer: MultiChoiceRenderer, eventName: 'operation-used' },
  'unfortunate encounter': { renderer: SingleChoiceRenderer, eventName: 'operation-used' },
  'spy transfer': { renderer: SingleChoiceRenderer, eventName: 'operation-used' },
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
