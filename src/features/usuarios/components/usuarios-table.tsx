"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import type { UsuarioRow } from "@/features/auth/usuarios-admin";
import type { PapelVinculo } from "../schema";
import { formatDateTimeBR } from "@/lib/dates";
import { RedefinirSenhaDialog } from "./redefinir-senha-dialog";
import { type EmpresaOpcao, type ObraOpcao, UsuarioFormDialog } from "./usuario-form-dialog";

type Props = {
  data: UsuarioRow[];
  empresas: EmpresaOpcao[];
  obrasPorEmpresa: Record<string, ObraOpcao[]>;
  meuId: string;
  papelFixo?: PapelVinculo;
};

export function UsuariosTable({ data, empresas, obrasPorEmpresa, meuId, papelFixo }: Props) {
  const columns: ColumnDef<UsuarioRow>[] = [
    { accessorKey: "nome", header: "Nome", cell: ({ row }) => <span className="font-medium">{row.original.nome}</span> },
    { accessorKey: "email", header: "E-mail" },
    {
      id: "perfil",
      header: "Perfil",
      accessorFn: (u) => (u.admin ? "Administrador" : u.vinculos.map((v) => v.papel).join(" ")),
      cell: ({ row }) =>
        row.original.admin ? (
          <Badge>Administrador</Badge>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.original.vinculos.map((v) => (
              <Badge key={v.empresaId} variant="secondary">
                {v.papel === "empresa" ? "Empresa" : "Cliente"} · {v.empresaNome}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      accessorKey: "ativo",
      header: "Situação",
      cell: ({ row }) => (row.original.ativo ? <Badge variant="secondary">Ativo</Badge> : <Badge variant="outline">Desativado</Badge>),
    },
    {
      accessorKey: "criadoEm",
      header: "Criado em",
      cell: ({ row }) => formatDateTimeBR(new Date(row.original.criadoEm)),
    },
    {
      id: "acoes",
      header: () => <span className="sr-only">Ações</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <UsuarioFormDialog usuario={row.original} empresas={empresas} obrasPorEmpresa={obrasPorEmpresa} meuId={meuId} papelFixo={papelFixo} />
          <RedefinirSenhaDialog usuarioId={row.original.id} nome={row.original.nome} />
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Buscar por nome ou e-mail..."
      emptyMessage={papelFixo === "cliente" ? "Nenhum cliente cadastrado." : papelFixo === "empresa" ? "Nenhuma empresa com acesso ao painel." : "Nenhum usuário encontrado."}
    />
  );
}
