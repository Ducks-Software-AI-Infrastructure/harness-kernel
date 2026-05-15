function constructorOf(value: object): { readonly type?: string; readonly label?: string; readonly name?: string } {
  return value.constructor as { readonly type?: string; readonly label?: string; readonly name?: string };
}

export function constructTypeOf(value: object): string {
  const ctor = constructorOf(value);
  return ctor.type ?? ctor.name ?? "AnonymousConstruct";
}

function stripConstructSuffix(name: string): string {
  return name.replace(/(Tool|Mode|Provider|ContextProvider|Hook|Role|Event)$/u, "");
}

function wordsFromName(name: string): string[] {
  const spaced = name
    .replace(/[_:-]+/gu, " ")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
    .trim();
  return spaced ? spaced.split(/\s+/u) : [name];
}

export function labelFromType(type: string): string {
  return wordsFromName(stripConstructSuffix(type))
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function snakeFromType(type: string): string {
  return wordsFromName(stripConstructSuffix(type))
    .map((word) => word.toLowerCase())
    .join("_");
}
