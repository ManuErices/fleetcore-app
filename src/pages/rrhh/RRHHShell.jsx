import React from "react";
import RRHH from "./index";

/**
 * RRHHShell.jsx — src/pages/rrhh/RRHHShell.jsx
 *
 * Antes este componente dibujaba una barra superior con la marca, la empresa
 * activa y el menú de usuario. Los tres se mudaron a la barra lateral de
 * AppShellLayout, que es el patrón de Finanzas: la información está en un solo
 * lugar y cada pantalla recupera los ~61px que ocupaba el header.
 *
 * Queda como envoltorio delgado —no se elimina— porque App.jsx lo monta por
 * nombre y porque es el punto natural donde colgar cosas propias de RRHH que
 * no pertenezcan al shell genérico.
 */
export default function RRHHShell({
  user, userRole, onLogout, onBackToSelector, onAdminPanel, onAdminEmpresaPanel,
}) {
  return (
    <RRHH
      user={user}
      userRole={userRole}
      onLogout={onLogout}
      onBackToSelector={onBackToSelector}
      onAdminPanel={onAdminPanel}
      onAdminEmpresaPanel={onAdminEmpresaPanel}
    />
  );
}
