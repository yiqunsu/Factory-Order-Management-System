import Database from 'better-sqlite3'
import * as mariadb from 'mariadb'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env manually
const env = readFileSync(resolve(process.cwd(), '.env'), 'utf-8')
for (const line of env.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '')
}

const SQLITE_PATH = resolve(process.cwd(), '../film-order-system 2/dev.db')

const url = new URL(process.env.DATABASE_URL)
const pool = mariadb.createPool({
  host: url.hostname,
  port: Number(url.port),
  user: url.username,
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  connectionLimit: 5,
})

const sqlite = new Database(SQLITE_PATH, { readonly: true })

async function migrate() {
  const conn = await pool.getConnection()
  try {
    console.log('开始迁移...\n')

    // 按依赖顺序迁移，先清空（倒序）
    await conn.query('SET FOREIGN_KEY_CHECKS=0')
    for (const t of ['ProductionTask','Order','Formula','Customer','MachineCategory','Machine','Product','ProductCategory','Pattern']) {
      await conn.query(`DELETE FROM \`${t}\``)
    }
    await conn.query('SET FOREIGN_KEY_CHECKS=1')

    // 1. ProductCategory
    const cats = sqlite.prepare('SELECT * FROM ProductCategory').all()
    for (const r of cats) {
      await conn.query(
        'INSERT INTO ProductCategory (id,name,`desc`,createdAt) VALUES (?,?,?,?)',
        [r.id, r.name, r.desc ?? null, new Date(r.createdAt)]
      )
    }
    console.log(`✓ ProductCategory: ${cats.length} 条`)

    // 2. Product
    const products = sqlite.prepare('SELECT * FROM Product').all()
    for (const r of products) {
      await conn.query(
        'INSERT INTO Product (id,name,categoryId,createdAt) VALUES (?,?,?,?)',
        [r.id, r.name, r.categoryId, new Date(r.createdAt)]
      )
    }
    console.log(`✓ Product: ${products.length} 条`)

    // 3. Pattern
    const patterns = sqlite.prepare('SELECT * FROM Pattern').all()
    for (const r of patterns) {
      await conn.query(
        'INSERT INTO Pattern (id,name,`desc`) VALUES (?,?,?)',
        [r.id, r.name, r.desc ?? null]
      )
    }
    console.log(`✓ Pattern: ${patterns.length} 条`)

    // 4. Machine
    const machines = sqlite.prepare('SELECT * FROM Machine').all()
    for (const r of machines) {
      await conn.query(
        'INSERT INTO Machine (id,name,isActive,minWidth,maxWidth,notes,createdAt) VALUES (?,?,?,?,?,?,?)',
        [r.id, r.name, r.isActive ? 1 : 0, r.minWidth, r.maxWidth, r.notes ?? null, new Date(r.createdAt)]
      )
    }
    console.log(`✓ Machine: ${machines.length} 条`)

    // 5. MachineCategory
    const machineCats = sqlite.prepare('SELECT * FROM MachineCategory').all()
    for (const r of machineCats) {
      await conn.query(
        'INSERT INTO MachineCategory (machineId,categoryId) VALUES (?,?)',
        [r.machineId, r.categoryId]
      )
    }
    console.log(`✓ MachineCategory: ${machineCats.length} 条`)

    // 6. Customer
    const customers = sqlite.prepare('SELECT * FROM Customer').all()
    for (const r of customers) {
      await conn.query(
        'INSERT INTO Customer (id,company,contact,notes,createdAt) VALUES (?,?,?,?,?)',
        [r.id, r.company, r.contact, r.notes ?? null, new Date(r.createdAt)]
      )
    }
    console.log(`✓ Customer: ${customers.length} 条`)

    // 7. Formula
    const formulas = sqlite.prepare('SELECT * FROM Formula').all()
    for (const r of formulas) {
      await conn.query(
        'INSERT INTO Formula (id,name,productId,specParams,materials,sourceId,notes,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)',
        [r.id, r.name, r.productId, r.specParams, r.materials, r.sourceId ?? null, r.notes ?? null, new Date(r.createdAt), new Date(r.updatedAt)]
      )
    }
    console.log(`✓ Formula: ${formulas.length} 条`)

    // 8. ProductionTask
    const tasks = sqlite.prepare('SELECT * FROM ProductionTask').all()
    for (const r of tasks) {
      await conn.query(
        'INSERT INTO ProductionTask (id,machineId,position,status,notes,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)',
        [r.id, r.machineId, r.position, r.status, r.notes ?? null, new Date(r.createdAt), new Date(r.updatedAt)]
      )
    }
    console.log(`✓ ProductionTask: ${tasks.length} 条`)

    console.log('\n迁移完成！')
  } catch (e) {
    console.error('迁移失败:', e.message)
    throw e
  } finally {
    conn.release()
    await pool.end()
    sqlite.close()
  }
}

migrate()
