import type {
  ContextProviderBinding,
  ContextProviderReference,
  ContextProviderSummary,
  HarnessContextProvider,
  HarnessContextProviderClass,
  HarnessContextProviderSelector,
  HarnessEvent,
  HarnessEventClass,
  HarnessHook,
  HarnessMode,
  HarnessModeClass,
  HarnessModeSelector,
  HarnessModeSummary,
  HarnessRoleDefinition,
  HarnessRoleClass,
  HarnessRoleSelector,
  HarnessTool,
  HarnessToolClass,
  HarnessToolSelector,
  JsonObject,
} from "./types.js";
import {
  HarnessContextProvider as HarnessContextProviderBase,
  HarnessHook as HarnessHookBase,
  HarnessMode as HarnessModeBase,
  HarnessRole as HarnessRoleBase,
  HarnessTool as HarnessToolBase,
} from "./types.js";

type ConstructClass = {
  readonly type?: string;
  readonly label?: string;
  readonly name?: string;
};

function constructClass(value: object | Function): ConstructClass {
  return (typeof value === "function" ? value : value.constructor) as ConstructClass;
}

function stripConstructSuffix(name: string): string {
  return name.replace(/(ContextProvider|Provider|Tool|Mode|Hook|Role|Event)$/u, "");
}

function wordsFromName(name: string): string[] {
  const spaced = name
    .replace(/[_:-]+/gu, " ")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
    .trim();
  return spaced ? spaced.split(/\s+/u) : [name];
}

function snakeFromType(type: string): string {
  return wordsFromName(stripConstructSuffix(type))
    .map((word) => word.toLowerCase())
    .join("_");
}

function labelFromType(type: string): string {
  return wordsFromName(stripConstructSuffix(type))
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function getConstructType(constructOrClass: object | Function): string {
  const cls = constructClass(constructOrClass);
  return cls.type ?? cls.name ?? "AnonymousConstruct";
}

export function getConstructLabel(constructOrClass: object | Function): string {
  const instanceLabel = typeof constructOrClass === "object"
    && "label" in constructOrClass
    && typeof (constructOrClass as { label?: unknown }).label === "string"
    ? (constructOrClass as { label: string }).label
    : undefined;
  if (instanceLabel) return instanceLabel;
  const cls = constructClass(constructOrClass);
  return cls.label ?? labelFromType(getConstructType(constructOrClass));
}

export function getToolName(toolOrClass: HarnessTool | HarnessToolClass): string {
  if (typeof toolOrClass === "object" && typeof toolOrClass.name === "string") return toolOrClass.name;
  const cls = constructClass(toolOrClass) as ConstructClass & { readonly name?: string };
  return cls.name ?? snakeFromType(getConstructType(toolOrClass));
}

export function getRoleName(role: HarnessRoleDefinition): string {
  return role.name ?? role.nativeRole ?? snakeFromType(getConstructType(role));
}

export function modeSummary(mode: HarnessMode): HarnessModeSummary {
  return {
    type: getConstructType(mode),
    label: getConstructLabel(mode),
  };
}

export function contextProviderSummary(
  provider: HarnessContextProvider,
  options?: JsonObject,
): ContextProviderSummary {
  return {
    type: getConstructType(provider),
    label: getConstructLabel(provider),
    options,
  };
}

export function isConstructInstance<TBase extends abstract new (...args: any[]) => unknown>(
  value: unknown,
  BaseClass: TBase,
): value is InstanceType<TBase> {
  return value instanceof BaseClass;
}

export function isModeInstance(value: unknown): value is HarnessMode {
  return isConstructInstance(value, HarnessModeBase);
}

export function isToolInstance(value: unknown): value is HarnessTool {
  return isConstructInstance(value, HarnessToolBase);
}

export function isContextProviderInstance(value: unknown): value is HarnessContextProvider {
  return isConstructInstance(value, HarnessContextProviderBase);
}

export function isRoleInstance(value: unknown): value is HarnessRoleDefinition {
  return isConstructInstance(value, HarnessRoleBase);
}

export function isHookInstance(value: unknown): value is HarnessHook {
  return isConstructInstance(value, HarnessHookBase);
}

function isClassLike(value: unknown): value is Function {
  return typeof value === "function" && typeof value.prototype === "object";
}

export function isModeClass(value: unknown): value is HarnessModeClass {
  return isClassLike(value) && HarnessModeBase.prototype.isPrototypeOf(value.prototype);
}

export function isToolClass(value: unknown): value is HarnessToolClass {
  return isClassLike(value) && HarnessToolBase.prototype.isPrototypeOf(value.prototype);
}

export function isRoleClass(value: unknown): value is HarnessRoleClass {
  return isClassLike(value) && HarnessRoleBase.prototype.isPrototypeOf(value.prototype);
}

export function isContextProviderClass(value: unknown): value is HarnessContextProviderClass {
  return isClassLike(value) && HarnessContextProviderBase.prototype.isPrototypeOf(value.prototype);
}

export function modeMatchesSelector(mode: HarnessMode, selector: HarnessModeSelector | string): boolean {
  if (typeof selector === "string") return getConstructType(mode) === selector;
  if (isModeClass(selector)) return mode instanceof selector || getConstructType(mode) === getConstructType(selector);
  return mode === selector || mode.constructor === selector.constructor || getConstructType(mode) === getConstructType(selector);
}

export function toolMatchesSelector(tool: HarnessTool, selector: HarnessToolSelector | string): boolean {
  if (typeof selector === "string") return getToolName(tool) === selector || getConstructType(tool) === selector;
  if (isToolClass(selector)) return tool instanceof selector || getConstructType(tool) === getConstructType(selector);
  return tool === selector || tool.constructor === selector.constructor || getConstructType(tool) === getConstructType(selector);
}

export function roleMatchesSelector(role: HarnessRoleDefinition, selector: HarnessRoleSelector | string): boolean {
  if (typeof selector === "string") {
    return getRoleName(role) === selector || getConstructType(role) === selector || role.nativeRole === selector;
  }
  if (isRoleClass(selector)) return role instanceof selector || getConstructType(role) === getConstructType(selector);
  return role === selector || role.constructor === selector.constructor || getConstructType(role) === getConstructType(selector);
}

export function contextProviderMatchesSelector(
  provider: HarnessContextProvider,
  selector: HarnessContextProviderSelector | string,
): boolean {
  if (typeof selector === "string") return getConstructType(provider) === selector;
  if (isContextProviderClass(selector)) {
    return provider instanceof selector || getConstructType(provider) === getConstructType(selector);
  }
  return provider === selector
    || provider.constructor === selector.constructor
    || getConstructType(provider) === getConstructType(selector);
}

export function hookEventClass(hook: HarnessHook): HarnessEventClass | undefined {
  const eventClass = hook.eventClass;
  if (eventClass) return eventClass;
  const legacyEvents = (hook as { events?: unknown }).events;
  if (legacyEvents !== undefined) {
    throw new Error(
      `Hook '${getConstructType(hook)}' uses the old events array. Extend HarnessHook.for(EventClass) instead.`,
    );
  }
  return undefined;
}

export function eventType(eventClass: HarnessEventClass | (abstract new (...args: any[]) => HarnessEvent)): string {
  return getConstructType(eventClass);
}

export function isContextProviderBinding(value: unknown): value is ContextProviderBinding {
  return typeof value === "object"
    && value !== null
    && "provider" in value
    && (isContextProviderInstance((value as { provider?: unknown }).provider)
      || isContextProviderClass((value as { provider?: unknown }).provider));
}

export function isContextProviderReference(value: unknown): value is ContextProviderReference {
  return isContextProviderInstance(value) || isContextProviderClass(value) || isContextProviderBinding(value);
}

export function assertNoAuthorId(construct: object, kind: string): void {
  if (Object.prototype.hasOwnProperty.call(construct, "id")) {
    throw new Error(`${kind} '${getConstructType(construct)}' declares an author id. Use the class type instead.`);
  }
}
