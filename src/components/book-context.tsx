import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { clients, getBook, type Book } from "@/lib/mock";

type Ctx = {
  clientId: string;
  setClientId: (id: string) => void;
  book: Book;
};

const BookContext = createContext<Ctx | null>(null);

export function BookProvider({ children }: { children: ReactNode }) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "harbor-ridge");
  const book = useMemo(() => getBook(clientId), [clientId]);
  return (
    <BookContext.Provider value={{ clientId, setClientId, book }}>{children}</BookContext.Provider>
  );
}

export function useBook() {
  const ctx = useContext(BookContext);
  if (!ctx) throw new Error("useBook precisa estar dentro de BookProvider");
  return ctx;
}
