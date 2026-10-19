// Règles de dépendance de l'architecture cible (spec, « Règles de dépendance »).
// Plan 2 : bloquant (les modules existent, la CI échoue sur toute violation).
const SEVERITY = 'error'

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domaine-pur',
      comment: "Le domaine n'importe que son propre domaine (et Node).",
      severity: SEVERITY,
      from: { path: '^src/modules/([^/]+)/domain/' },
      to: {
        pathNot: ['^src/modules/$1/domain/', '^src/shared/(actor|errors)\\.ts$'],
        dependencyTypesNot: ['core'],
      },
    },
    {
      name: 'shared-autonome',
      comment: 'shared/ ne dépend que de lui-même (et de lib/auth pour la session).',
      severity: SEVERITY,
      from: { path: '^src/shared/' },
      to: { path: '^src/', pathNot: ['^src/shared/', '^src/lib/auth\\.ts$'] },
    },
    {
      name: 'application-sans-infrastructure',
      comment: "Un use case passe par ses ports, jamais par l'infrastructure.",
      severity: SEVERITY,
      from: { path: '^src/modules/([^/]+)/application/' },
      to: { path: '^src/modules/$1/infrastructure/' },
    },
    {
      name: 'application-sans-techno',
      comment: 'Un use case ne connaît ni pg, ni S3, ni Tesseract, ni bcrypt, ni Next.',
      severity: SEVERITY,
      from: { path: '^src/modules/[^/]+/application/' },
      to: { path: 'node_modules/(pg|@aws-sdk|tesseract\\.js|bcryptjs|nodemailer|next|next-auth)/' },
    },
    {
      name: 'module-par-son-index',
      comment: "Un module ne voit un autre module que par son index.ts.",
      severity: SEVERITY,
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/', pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$'] },
    },
    {
      name: 'app-par-les-index',
      comment: "app/ n'entre dans un module que par son index.ts.",
      severity: SEVERITY,
      from: { path: '^src/app/' },
      to: { path: '^src/modules/[^/]+/(?!index\\.ts$)' },
    },
    {
      name: 'shared-sans-module',
      severity: SEVERITY,
      from: { path: '^src/shared/' },
      to: { path: '^src/(modules|app|worker)/' },
    },
    {
      name: 'worker-isole',
      comment: "Le worker de livraison n'importe que shared/config et shared/logger.",
      severity: SEVERITY,
      from: { path: '^src/worker/' },
      to: { path: '^src/', pathNot: ['^src/worker/', '^src/shared/(config|logger)\\.ts$'] },
    },
    {
      name: 'pas-de-lib',
      comment:
        "Les modules n'importent jamais src/lib ; app/ n'y importe que lib/auth.ts (session).",
      severity: SEVERITY,
      from: { path: '^src/(modules|app)/' },
      to: { path: '^src/lib/', pathNot: ['^src/lib/auth\\.ts$'] },
    },
    {
      name: 'pas-de-cycle',
      severity: SEVERITY,
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
}
