import { startServer } from './app.js'

const { port, baseDir } = await startServer()
console.log(`\n  prolife · servidor local`)
console.log(`  http://127.0.0.1:${port}`)
console.log(`  datos → ${baseDir}\n`)
