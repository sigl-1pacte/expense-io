// Prépare un SonarQube neuf pour une analyse : mot de passe administrateur,
// projet `expense-io`, jeton d'analyse. Écrit le jeton (et rien d'autre) sur
// stdout. Idempotent : relançable sur un serveur déjà préparé.
//
//   SONAR_HOST_URL      (défaut http://localhost:9000)
//   SONAR_ADMIN_PASSWORD  mot de passe à poser sur le compte admin (obligatoire)
const host = process.env.SONAR_HOST_URL ?? 'http://localhost:9000'
const newPassword = process.env.SONAR_ADMIN_PASSWORD
const projectKey = 'expense-io'

if (!newPassword) {
  console.error('SONAR_ADMIN_PASSWORD est requis.')
  process.exit(1)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitUntilUp() {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`${host}/api/system/status`)
      if (response.ok && (await response.json()).status === 'UP') return
    } catch {
      // serveur pas encore à l'écoute
    }
    await sleep(2000)
  }
  throw new Error(`SonarQube n'est pas UP après 4 minutes (${host}).`)
}

async function api(path, password, params = {}, method = 'POST') {
  const url = new URL(path, host)
  const body = new URLSearchParams(params)
  const response = await fetch(method === 'GET' ? `${url}?${body}` : url, {
    method,
    headers: { authorization: `Basic ${Buffer.from(`admin:${password}`).toString('base64')}` },
    body: method === 'GET' ? undefined : body,
  })
  return response
}

await waitUntilUp()

// 1. Mot de passe : on tente l'ancien (admin) une seule fois.
let password = newPassword
const probe = await api('/api/authentication/validate', newPassword, {}, 'GET')
if (!(await probe.json()).valid) {
  const changed = await api('/api/users/change_password', 'admin', {
    login: 'admin',
    previousPassword: 'admin',
    password: newPassword,
  })
  if (!changed.ok) throw new Error(`Changement du mot de passe admin refusé (${changed.status}).`)
}

// 2. Projet.
const search = await api('/api/projects/search', password, { projects: projectKey }, 'GET')
if ((await search.json()).components.length === 0) {
  const created = await api('/api/projects/create', password, { project: projectKey, name: 'Expense.io' })
  if (!created.ok) throw new Error(`Création du projet refusée (${created.status}).`)
}

// 3. Jeton d'analyse, nom unique.
const token = await api('/api/user_tokens/generate', password, {
  name: `analyse-${Date.now()}`,
  type: 'GLOBAL_ANALYSIS_TOKEN',
})
if (!token.ok) throw new Error(`Génération du jeton refusée (${token.status}).`)
process.stdout.write((await token.json()).token)
