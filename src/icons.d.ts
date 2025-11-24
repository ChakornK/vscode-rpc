declare module "*.yml" {
  const config: IconConfig;
  const aliases: IconAliases;
}

type LanguageAsset = {
  custom?: {
    asset: string;
    matcher: {
      type: "string" | "regex";
      content: string;
    };
  }[];
  default: string;
};
type IconConfig = {
  [key: string]: LanguageAsset;
};
type IconAliases = {
  [key in keyof IconConfig]: string[];
};
