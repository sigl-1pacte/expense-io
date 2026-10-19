import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { iam } from '@/modules/iam'
import { config } from '@/shared/config'
import { Unauthenticated } from '@/shared/errors'
import { logger } from '@/shared/logger'

// Secret lu et validé par shared/config au chargement : l'application refuse de
// démarrer sans AUTH_SECRET. (Pas de forme paresseuse `NextAuth(() => …)` : avec
// next-auth 5.0.0-beta.32, elle fait renvoyer une Promise à `auth(cb)` et casse
// src/proxy.ts — décision prise au plan 1, tâche 6.)
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: config().authSecret,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email : null
        const password = typeof credentials?.password === 'string' ? credentials.password : null
        if (!email || !password) return null
        return iam.authenticate(email, password)
      },
    }),
  ],
  callbacks: {
    // F31 : le jeton ne porte que l'identité ; le rôle est relu en base.
    async jwt({ token, user }) {
      if (user?.id) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === 'string') {
        session.user.id = token.id
        const userId = token.id
        const actor = await iam.getActor(userId).catch((error: unknown) => {
          // Compte supprimé : cas normal. Toute autre erreur (base indisponible…) est tracée.
          if (!(error instanceof Unauthenticated)) {
            logger.warn('session: rôle illisible, repli sans privilège', { userId, reason: error instanceof Error ? error.name : 'inconnue' })
          }
          return null
        })
        // Compte supprimé : aucun privilège dans l'UI ; les API répondent 401.
        session.user.role = actor?.role ?? 'employee'
      }
      return session
    },
  },
})
