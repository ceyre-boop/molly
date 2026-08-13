// Identity graph — real names, roles, history. The layer Noa structurally can't have.
import { db } from "./memory"

db.run(`
  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT DEFAULT '',
    org TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS person_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL REFERENCES people(id),
    event TEXT NOT NULL,
    ts INTEGER NOT NULL
  );
`)

export interface Person {
  id: number
  name: string
  role: string
  org: string
  notes: string
  first_seen: number
  last_seen: number
}

export function addPerson(name: string, role = "", org = "", notes = ""): Person {
  const now = Date.now()
  const person = db
    .query(
      "INSERT INTO people (name, role, org, notes, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
    )
    .get(name, role, org, notes, now, now) as Person
  addEvent(person.id, "added to identity graph")
  return person
}

export function listPeople(limit = 50): Person[] {
  return db.query("SELECT * FROM people ORDER BY last_seen DESC LIMIT ?").all(limit) as Person[]
}

export function searchPeople(term: string, limit = 10): Person[] {
  const like = `%${term}%`
  return db
    .query(
      "SELECT * FROM people WHERE name LIKE ? OR role LIKE ? OR org LIKE ? OR notes LIKE ? ORDER BY last_seen DESC LIMIT ?"
    )
    .all(like, like, like, like, limit) as Person[]
}

export function touchPerson(id: number, event: string): void {
  db.query("UPDATE people SET last_seen = ? WHERE id = ?").run(Date.now(), id)
  addEvent(id, event)
}

export function addEvent(personId: number, event: string): void {
  db.query("INSERT INTO person_events (person_id, event, ts) VALUES (?, ?, ?)").run(
    personId,
    event,
    Date.now()
  )
}

export function personEvents(personId: number, limit = 10): Array<{ event: string; ts: number }> {
  return db
    .query("SELECT event, ts FROM person_events WHERE person_id = ? ORDER BY ts DESC LIMIT ?")
    .all(personId, limit) as Array<{ event: string; ts: number }>
}

export function peopleCount(): number {
  return (db.query("SELECT COUNT(*) n FROM people").get() as { n: number }).n
}
