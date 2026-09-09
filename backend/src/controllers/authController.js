const z = require('zod');
const prisma = require('../config/db');
const { hashPassword, comparePassword, createToken } = require('../utils/auth');
const { created, ok, fail } = require('../utils/response');

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'RECRUITER', 'CANDIDATE']),
});

async function register(req, res) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

  const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (exists) return fail(res, 409, 'User already exists');

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
    },
    select: { id: true, email: true, role: true },
  });

  return created(res, user, 'User registered');
}

async function login(req, res) {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return fail(res, 401, 'Invalid credentials');

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) return fail(res, 401, 'Invalid credentials');

  const token = createToken({ id: user.id, role: user.role, email: user.email });
  return ok(res, { token, user: { id: user.id, email: user.email, role: user.role } }, 'Login successful');
}

module.exports = { register, login };
