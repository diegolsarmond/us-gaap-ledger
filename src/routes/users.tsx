import { createFileRoute } from "@tanstack/react-router";
import { AdministrationList } from "@/components/administration-list";
export const Route = createFileRoute("/users")({
  component: () => <AdministrationList kind="users" />,
});
