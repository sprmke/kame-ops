async function seed() {
  console.log("KameOps uses Google sign-in only. No seed user is created.");
  console.log(
    "Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local, then sign in at /login.",
  );
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
