// The landing page's film shelf: a hand-picked slice of the real library
// (public/luts/film_luts.json). Each thumbnail is the actual LUT applied to
// one sample photo (public/landing, graded offline from the real .cube files),
// so the demo shows true colour without needing WebGPU.

export type FilmCategory = 'Negative' | 'Black & white' | 'Slide' | 'Instant'

export const CATEGORIES: readonly FilmCategory[] = ['Negative', 'Black & white', 'Slide', 'Instant']

/** `grain` is the same print with the engine's grain shader applied (see the ADR). */
export type Film = Readonly<{ name: string; category: FilmCategory; thumb: string; grain: string }>

const film = (name: string, category: FilmCategory, path: string): Film => ({
  name,
  category,
  thumb: `/landing/${path.split('/').pop()}.jpg`,
  grain: `/landing/${path.split('/').pop()}-grain.jpg`,
})

export const FILMS: readonly Film[] = [
  film('Kodak Portra 400 −', 'Negative', 'negative_new/kodak_portra_400_-'),
  film('Kodak Portra 400 +', 'Negative', 'negative_new/kodak_portra_400_+'),
  film('Fuji 400H −', 'Negative', 'negative_new/fuji_400h_-'),
  film('Fuji 160C', 'Negative', 'negative_new/fuji_160c'),
  film('Kodak Portra 800 +', 'Negative', 'negative_new/kodak_portra_800_+'),
  film('Fuji 800Z −', 'Negative', 'negative_new/fuji_800z_-'),
  film('Kodak T-Max 400', 'Black & white', 'bw/kodak_t-max_400'),
  film('Ilford HP5 Plus 400', 'Black & white', 'bw/ilford_hp_5_plus_400'),
  film('Agfa APX 25', 'Black & white', 'bw/agfa_apx_25'),
  film('Rollei Retro 80S', 'Black & white', 'bw/rollei_retro_80s'),
  film('Kodak Kodachrome 25', 'Slide', 'colorslide/kodak_kodachrome_25'),
  film('Fuji Provia 400F', 'Slide', 'colorslide/fuji_provia_400f'),
  film('Fuji Astia 100F', 'Slide', 'colorslide/fuji_astia_100f'),
  film('Kodak Elite Chrome 400', 'Slide', 'colorslide/kodak_elite_chrome_400'),
  film('Polaroid 665 ++', 'Instant', 'instant_pro/polaroid_665_++'),
  film('Fuji FP-100C +', 'Instant', 'instant_pro/fuji_fp-100c_+'),
  film('Polaroid 690 Cold ++', 'Instant', 'instant_pro/polaroid_690_cold_++'),
  film('Polaroid PX-680 Warm ++', 'Instant', 'instant_consumer/polaroid_px-680_warm_++'),
]

/** The film's index within the whole shelf, by category (first of its group). */
export const firstOf = (category: FilmCategory): number =>
  FILMS.findIndex((f) => f.category === category)
