import Encabezado from "@/components/Encabezado";

// Páginas con encabezado. Ingreso y registro quedan fuera y muestran el logo completo.
export default function SitioLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Encabezado />
      {children}
    </>
  );
}
