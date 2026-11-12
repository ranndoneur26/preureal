import type { Metadata } from "next";
import HashBridge from "@/components/HashBridge";

export const metadata: Metadata = {
  title: "Registre",
  robots: { index: false },
};

export default function Page() {
  return <HashBridge to="/#/registre" />;
}
