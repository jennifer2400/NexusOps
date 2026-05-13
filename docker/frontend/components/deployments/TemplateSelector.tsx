const templates = [
  {
    id: 'restaurant',
    title: 'Restaurant Website',
    description: 'Menu, WhatsApp orders and QR support',
  },
  {
    id: 'barbershop',
    title: 'Barbershop Landing',
    description: 'Appointments, pricing and gallery',
  },
  {
    id: 'ecommerce',
    title: 'E-Commerce Store',
    description: 'Products, checkout and catalog system',
  },
  {
    id: 'corporate',
    title: 'Corporate Website',
    description: 'Professional services and business presence',
  },
];

export default function TemplateSelector() {
  return (
    <section>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">
          Business Templates
        </h2>

        <p className="mt-2 text-sm text-zinc-400">
          Pre-configured experiences designed for local businesses.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {templates.map((template) => (
          <div
            key={template.id}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-zinc-600"
          >
            <div className="mb-4 h-36 rounded-xl bg-zinc-800" />

            <h3 className="text-lg font-semibold text-white">
              {template.title}
            </h3>

            <p className="mt-2 text-sm text-zinc-400">
              {template.description}
            </p>

            <button className="mt-5 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:opacity-90">
              Use Template
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
