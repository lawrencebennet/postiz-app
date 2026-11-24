import {
  clientIp,
  newTemporaryPassword,
  passwordProblem,
  PASSWORD_MAX_BYTES,
} from './credentials';

describe('password quality', () => {
  const email = 'anna.rossi@casapandora.it';
  it.each([
    ['', 'PASSWORD_TOO_SHORT'],
    ['corta123', 'PASSWORD_TOO_SHORT'],
    ['123456789', 'PASSWORD_TOO_SHORT'],
    ['anna.rossi@casapandora.it', 'PASSWORD_IS_EMAIL'],
    ['ANNA.ROSSI@CASAPANDORA.IT', 'PASSWORD_IS_EMAIL'],
    ['annarossi1', null],
    ['anna.rossi', 'PASSWORD_IS_EMAIL'],
    ['password123', 'PASSWORD_TOO_COMMON'],
    ['Password123', 'PASSWORD_TOO_COMMON'],
    ['qwertyuiop', 'PASSWORD_TOO_COMMON'],
    ['1234567890', 'PASSWORD_TOO_COMMON'],
    ['0987654321', 'PASSWORD_TOO_COMMON'],
    ['abcdefghijkl', 'PASSWORD_TOO_COMMON'],
    ['aaaaaaaaaaaa', 'PASSWORD_TOO_COMMON'],
    ['abababababab', 'PASSWORD_TOO_COMMON'],
    ['neptive123', 'PASSWORD_TOO_COMMON'],
    ['x'.repeat(PASSWORD_MAX_BYTES + 1), 'PASSWORD_TOO_LONG'],
    ['è'.repeat(40), 'PASSWORD_TOO_LONG'],
    ['Gelato al pistacchio 7', null],
    ['tramonto-sul-po', null],
  ])('%s -> %s', (password, expected) => {
    expect(passwordProblem(password, email)).toBe(expected);
  });

  it('rejects the local part of the email used as a password', () => {
    expect(passwordProblem('marcobianchi', 'marcobianchi@studio.it')).toBe('PASSWORD_IS_EMAIL');
    expect(passwordProblem('Marco.Bianchi', 'marco.bianchi@studio.it')).toBe('PASSWORD_IS_EMAIL');
  });
});

describe('temporary password', () => {
  it('is long, random and passes the quality rules', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const value = newTemporaryPassword();
      expect(value).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
      expect(value).not.toMatch(/[01ilo]/);
      expect(passwordProblem(value, 'x@y.it')).toBeNull();
      seen.add(value);
    }
    expect(seen.size).toBe(200);
  });
});

describe('client IP behind the two nginx hops', () => {
  it('takes the address the outer proxy saw, not what the client wrote', () => {
    expect(clientIp('203.0.113.9, 172.18.0.1', '127.0.0.1', 2)).toBe('203.0.113.9');
    expect(clientIp('6.6.6.6, 7.7.7.7, 203.0.113.9, 172.18.0.1', '127.0.0.1', 2)).toBe('203.0.113.9');
    expect(clientIp(undefined, '::1', 2)).toBe('::1');
    expect(clientIp('172.18.0.1', '127.0.0.1', 2)).toBe('172.18.0.1');
    expect(clientIp('203.0.113.9', '127.0.0.1', 1)).toBe('203.0.113.9');
  });
});
