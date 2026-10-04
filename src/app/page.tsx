import { ModeToggle } from "@/components/layout/mode-toggle";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="absolute right-4 top-4">
        <ModeToggle />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">Registro Geral de Obra</h1>
      <p className="max-w-md text-muted-foreground">
        RGO — custos, receitas e margem das obras para a diretoria. Em construção.
      </p>
    </main>
  );
}
