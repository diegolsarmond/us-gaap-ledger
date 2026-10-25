import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ParametersProvider } from "@/lib/parameters-context";
import { ModalProvider } from "@/components/modal-provider";
export const Route = createFileRoute('/parameters')({ component: () => <ModalProvider><ParametersProvider><Outlet /></ParametersProvider></ModalProvider> });
