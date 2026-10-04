import { redirect } from "next/navigation";

// A raiz só encaminha: o proxy manda quem não tem sessão para /login.
export default function Home() {
  redirect("/dashboard");
}
