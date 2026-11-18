import { createContext, useContext } from "react";
import { translate } from "./locale";
import type { Locale } from "./model";

export const LocaleContext = createContext<Locale>("zh-CN");

export function useTranslation() {
  const locale = useContext(LocaleContext);
  return { locale, t: translate[locale] };
}
