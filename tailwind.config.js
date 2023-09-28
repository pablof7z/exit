module.exports = {
  purge: ['./src/**/*.svelte'],
  plugins: [
      require('daisyui'),
  ],
  daisyui: {
      themes: ["cupcake"],
  }
};