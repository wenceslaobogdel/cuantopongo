"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Download, Upload, RotateCcw, Trash2, Plus, Users, Wallet, ArrowRightLeft } from 'lucide-react'
import { cn } from "@/lib/utils"

type Person = { id: string; nombre: string }
type Expense = {
  id: string
  descripcion: string
  monto: number
  pagadorId: string
  participantes: string[] // person ids
  fecha: string // ISO
}
type AppState = {
  personas: Person[]
  gastos: Expense[]
  moneda: string
  version: 1
}

const STORAGE_KEY = "split-gastos-state-v1"

const MONEDAS = [
  { code: "USD", name: "USD #45; Dólar" },
  { code: "EUR", name: "EUR #45; Euro" },
  { code: "MXN", name: "MXN #45; Peso mexicano" },
  { code: "ARS", name: "ARS #45; Peso argentino" },
  { code: "COP", name: "COP #45; Peso colombiano" },
  { code: "CLP", name: "CLP #45; Peso chileno" },
  { code: "PEN", name: "PEN #45; Sol peruano" },
]

function fmtMoneda(v: number, moneda: string) {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: moneda, maximumFractionDigits: 2 }).format(v)
  } catch {
    return `${moneda} ${v.toFixed(2)}`
  }
}

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2)
}

export default function Page() {
  // Estado base
  const [state, setState] = useState<AppState>({
    personas: [],
    gastos: [],
    moneda: "USD",
    version: 1,
  })
  const [nuevoNombre, setNuevoNombre] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [monto, setMonto] = useState<number | "">("")
  const [pagadorId, setPagadorId] = useState<string>("")
  const [participantes, setParticipantes] = useState<string[]>([])
  const [fecha, setFecha] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [importing, setImporting] = useState(false)

  // Cargar de localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as AppState
        if (parsed && parsed.version === 1) {
          setState(parsed)
          // Ajustar formularios según datos
          if (parsed.personas.length > 0) {
            setPagadorId(parsed.personas[0].id)
            setParticipantes(parsed.personas.map((p) => p.id))
          }
        }
      }
    } catch {
      // ignore
    }
  }, [])

  // Guardar en localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // ignore
    }
  }, [state])

  // Derivados: mapas útiles
  const personasMap = useMemo(() => {
    const m = new Map<string, Person>()
    state.personas.forEach((p) => m.set(p.id, p))
    return m
  }, [state.personas])

  // Balances por persona
  const balances = useMemo(() => {
    const b: Record<string, number> = {}
    state.personas.forEach((p) => (b[p.id] = 0))

    for (const g of state.gastos) {
      if (g.monto <= 0 || g.participantes.length === 0) continue
      const share = g.monto / g.participantes.length
      for (const pid of g.participantes) {
        if (pid === g.pagadorId) {
          b[pid] = (b[pid] ?? 0) + (g.monto - share)
        } else {
          b[pid] = (b[pid] ?? 0) - share
        }
      }
      // Si el pagador no está entre participantes, se le debe todo
      if (!g.participantes.includes(g.pagadorId)) {
        b[g.pagadorId] = (b[g.pagadorId] ?? 0) + g.monto
      }
    }
    return b
  }, [state.gastos, state.personas])

  // Sugerencias para saldar (deudores -> acreedores)
  const settlements = useMemo(() => {
    type Entry = { id: string; amount: number }
    const debtors: Entry[] = []
    const creditors: Entry[] = []
    for (const pid of Object.keys(balances)) {
      const v = balances[pid]
      if (v < -0.005) debtors.push({ id: pid, amount: -v })
      else if (v > 0.005) creditors.push({ id: pid, amount: v })
    }
    // sort desc to greedily match biggest
    debtors.sort((a, b) => b.amount - a.amount)
    creditors.sort((a, b) => b.amount - a.amount)

    const moves: { fromId: string; toId: string; amount: number }[] = []
    let i = 0
    let j = 0
    while (i < debtors.length && j < creditors.length) {
      const d = debtors[i]
      const c = creditors[j]
      const pay = Math.min(d.amount, c.amount)
      moves.push({ fromId: d.id, toId: c.id, amount: pay })
      d.amount -= pay
      c.amount -= pay
      if (d.amount <= 0.005) i++
      if (c.amount <= 0.005) j++
    }
    return moves
  }, [balances])

  // Handlers
  function addPersona() {
    const nombre = nuevoNombre.trim()
    if (!nombre) return
    const exists = state.personas.some((p) => p.nombre.toLowerCase() === nombre.toLowerCase())
    if (exists) {
      setNuevoNombre("")
      return
    }
    const id = uuid()
    const next = { id, nombre }
    setState((s) => ({ ...s, personas: [...s.personas, next] }))
    setNuevoNombre("")
    // Ajustar formularios por defecto
    if (!pagadorId) setPagadorId(id)
    setParticipantes((prev) => Array.from(new Set([...prev, id])))
  }

  function removePersona(id: string) {
    setState((s) => ({
      ...s,
      personas: s.personas.filter((p) => p.id !== id),
      gastos: s.gastos
        .map((g) => ({
          ...g,
          participantes: g.participantes.filter((pid) => pid !== id),
        }))
        .filter((g) => g.pagadorId !== id), // eliminar gastos cuyo pagador ya no existe
    }))
    setParticipantes((prev) => prev.filter((pid) => pid !== id))
    if (pagadorId === id) setPagadorId("")
  }

  function toggleParticipante(id: string) {
    setParticipantes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function addGasto() {
    if (!descripcion.trim()) return
    if (monto === "" || isNaN(Number(monto)) || Number(monto) <= 0) return
    if (!pagadorId) return
    if (participantes.length === 0) return

    const g: Expense = {
      id: uuid(),
      descripcion: descripcion.trim(),
      monto: Number(monto),
      pagadorId,
      participantes: participantes.slice(),
      fecha: fecha ? new Date(fecha).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    }
    setState((s) => ({ ...s, gastos: [g, ...s.gastos] }))
    // Reset mínimos
    setDescripcion("")
    setMonto("")
  }

  function deleteGasto(id: string) {
    setState((s) => ({ ...s, gastos: s.gastos.filter((g) => g.id !== id) }))
  }

  function resetAll() {
    setState({ personas: [], gastos: [], moneda: "USD", version: 1 })
    setDescripcion("")
    setMonto("")
    setPagadorId("")
    setParticipantes([])
    setFecha(new Date().toISOString().slice(0, 10))
  }

  function loadEjemplo() {
    const a: Person = { id: uuid(), nombre: "Ana" }
    const l: Person = { id: uuid(), nombre: "Luis" }
    const t: Person = { id: uuid(), nombre: "Tú" }
    const gastos: Expense[] = [
      {
        id: uuid(),
        descripcion: "Supermercado",
        monto: 54.2,
        pagadorId: a.id,
        participantes: [a.id, l.id, t.id],
        fecha: new Date().toISOString().slice(0, 10),
      },
      {
        id: uuid(),
        descripcion: "Café",
        monto: 9.6,
        pagadorId: l.id,
        participantes: [l.id, t.id],
        fecha: new Date().toISOString().slice(0, 10),
      },
      {
        id: uuid(),
        descripcion: "Taxi",
        monto: 18,
        pagadorId: t.id,
        participantes: [a.id, t.id],
        fecha: new Date().toISOString().slice(0, 10),
      },
    ]
    const personas = [a, l, t]
    setState({ personas, gastos, moneda: "EUR", version: 1 })
    setPagadorId(a.id)
    setParticipantes(personas.map((p) => p.id))
  }

  function exportar() {
    const data = JSON.stringify(state, null, 2)
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "gastos.json"
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function importar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as AppState
      if (!parsed || !Array.isArray(parsed.personas) || !Array.isArray(parsed.gastos)) {
        throw new Error("Archivo inválido")
      }
      setState({
        personas: parsed.personas.map((p) => ({ id: p.id, nombre: p.nombre })),
        gastos: parsed.gastos.map((g) => ({
          id: g.id,
          descripcion: g.descripcion,
          monto: Number(g.monto),
          pagadorId: g.pagadorId,
          participantes: Array.isArray(g.participantes) ? g.participantes : [],
          fecha: g.fecha || new Date().toISOString().slice(0, 10),
        })),
        moneda: parsed.moneda || "USD",
        version: 1,
      })
      // Ajustar formularios
      const first = parsed.personas[0]
      setPagadorId(first ? first.id : "")
      setParticipantes(parsed.personas.map((p) => p.id))
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert("No se pudo importar el archivo.")
    } finally {
      setImporting(false)
      e.currentTarget.value = ""
    }
  }

  const totalGastos = useMemo(
    () => state.gastos.reduce((sum, g) => sum + (isFinite(g.monto) ? g.monto : 0), 0),
    [state.gastos]
  )

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-8">
      <header className="mb-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Divide gastos</h1>
          <p className="text-muted-foreground">Minimalista, rápido y sin registros.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={state.moneda}
            onValueChange={(v) => setState((s) => ({ ...s, moneda: v }))}
          >
            <SelectTrigger className="w-[180px]" aria-label="Seleccionar moneda">
              <SelectValue placeholder="Moneda" />
            </SelectTrigger>
            <SelectContent>
              {MONEDAS.map((m) => (
                <SelectItem key={m.code} value={m.code}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="secondary" onClick={loadEjemplo}>
            Demo
          </Button>
          <Button variant="outline" onClick={exportar}>
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept="application/json"
              onChange={importar}
              className="hidden"
              aria-label="Importar archivo JSON"
              disabled={importing}
            />
            <Button variant="outline" asChild>
              <span>
                <Upload className="mr-2 h-4 w-4" />
                Importar
              </span>
            </Button>
          </label>
          <Button variant="destructive" onClick={resetAll}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Personas */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Amigos
            </CardTitle>
            <CardDescription>Añade a quienes participan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="nombre" className="sr-only">
                Nombre
              </Label>
              <Input
                id="nombre"
                placeholder="Nombre..."
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addPersona()
                  }
                }}
              />
              <Button onClick={addPersona} disabled={!nuevoNombre.trim()}>
                <Plus className="mr-1 h-4 w-4" />
                Añadir
              </Button>
            </div>

            <ul className="space-y-2" aria-live="polite">
              {state.personas.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  Sin amigos aún. Añade al menos dos.
                </li>
              )}
              {state.personas.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs font-medium uppercase">
                      {p.nombre.slice(0, 2)}
                    </div>
                    <span className="text-sm">{p.nombre}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removePersona(p.id)}
                    aria-label={`Eliminar a ${p.nombre}`}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Formulario de gasto */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Añadir gasto
            </CardTitle>
            <CardDescription>Divide el gasto a partes iguales.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="descripcion">Descripción</Label>
                <Input
                  id="descripcion"
                  placeholder="p. ej., Cena, Uber, Entradas..."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="monto">Monto</Label>
                <Input
                  id="monto"
                  inputMode="decimal"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <div className="grid gap-2">
                <Label>Pagó</Label>
                <Select
                  value={pagadorId}
                  onValueChange={(v) => setPagadorId(v)}
                >
                  <SelectTrigger aria-label="Seleccionar pagador">
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    {state.personas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label>Participan</Label>
                <div className="flex flex-wrap gap-2 rounded-md border p-2">
                  {state.personas.length === 0 && (
                    <span className="text-sm text-muted-foreground">
                      Añade amigos para elegir participantes.
                    </span>
                  )}
                  {state.personas.map((p) => {
                    const checked = participantes.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleParticipante(p.id)}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors",
                          checked ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-background"
                        )}
                        aria-pressed={checked}
                        aria-label={`Participación de ${p.nombre}`}
                        title={checked ? "Incluido" : "Excluir/Incluir"}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleParticipante(p.id)}
                          className="pointer-events-none"
                        />
                        {p.nombre}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="fecha">Fecha</Label>
                <Input
                  id="fecha"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>
              <div className="md:col-span-2 flex items-end">
                <Button
                  className="w-full md:w-auto"
                  onClick={addGasto}
                  disabled={
                    !descripcion.trim() ||
                    monto === "" ||
                    Number(monto) <= 0 ||
                    !pagadorId ||
                    participantes.length === 0
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Añadir gasto
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resumen y saldos */}
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
            <CardDescription>Total pagado y saldos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-medium">{fmtMoneda(totalGastos, state.moneda)}</span>
            </div>
            <Separator />
            <ul className="space-y-2">
              {state.personas.length === 0 && (
                <li className="text-sm text-muted-foreground">Añade amigos para ver saldos.</li>
              )}
              {state.personas.map((p) => {
                const v = balances[p.id] ?? 0
                const positive = v > 0.005
                const zeroish = Math.abs(v) <= 0.005
                return (
                  <li key={p.id} className="flex items-center justify-between">
                    <span className="text-sm">{p.nombre}</span>
                    <Badge
                      variant={positive ? "default" : zeroish ? "secondary" : "destructive"}
                      className={cn(positive && "bg-emerald-600 hover:bg-emerald-600")}
                    >
                      {zeroish ? "OK" : positive ? `+ ${fmtMoneda(v, state.moneda)}` : `#45; ${fmtMoneda(-v, state.moneda)}`}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>

        {/* Sugerencias de pagos */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Sugerencias para saldar
            </CardTitle>
            <CardDescription>
              Pagos mínimos para dejar todo en cero.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {settlements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay pagos pendientes.</p>
            ) : (
              <ul className="space-y-2">
                {settlements.map((m, idx) => (
                  <li
                    key={`${m.fromId}-${m.toId}-${idx}`}
                    className="flex items-center justify-between rounded-md border p-2"
                  >
                    <span className="text-sm">
                      <strong>{personasMap.get(m.fromId)?.nombre ?? "¿?"}</strong> paga a{" "}
                      <strong>{personasMap.get(m.toId)?.nombre ?? "¿?"}</strong>
                    </span>
                    <span className="font-medium">{fmtMoneda(m.amount, state.moneda)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lista de gastos */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Gastos</CardTitle>
            <CardDescription>Historial de lo que se ha pagado.</CardDescription>
          </CardHeader>
          <CardContent>
            {state.gastos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay gastos.</p>
            ) : (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Pagó</TableHead>
                      <TableHead>Participantes</TableHead>
                      <TableHead className="w-[1%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {state.gastos.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell className="whitespace-nowrap">{g.fecha}</TableCell>
                        <TableCell className="max-w-[220px] truncate">{g.descripcion}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {fmtMoneda(g.monto, state.moneda)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {personasMap.get(g.pagadorId)?.nombre ?? "?"}
                        </TableCell>
                        <TableCell className="min-w-[180px]">
                          <div className="flex flex-wrap gap-1">
                            {g.participantes.map((pid) => (
                              <Badge key={pid} variant="secondary">
                                {personasMap.get(pid)?.nombre ?? "?"}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Eliminar gasto"
                            onClick={() => deleteGasto(g.id)}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <footer className="mt-10 text-center text-xs text-muted-foreground">
        Hecho con ❤️ para dividir gastos de forma simple.
      </footer>
    </main>
  )
}
