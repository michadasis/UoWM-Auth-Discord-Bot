<script>
	let { data } = $props();

	const toneClasses = {
		success: 'border-[#57F287]',
		info: 'border-[#5865F2]',
		warning: 'border-[#E67E22]',
		error: 'border-[#ED4245]'
	};
</script>

<svelte:head>
	<title>{data.message.title} | Πληροφορική UoWM Discord</title>
</svelte:head>

<section class="mx-auto max-w-2xl px-6 py-24">
	<div class="rounded-lg border-l-4 bg-skin-accent p-8 text-skin-base {toneClasses[data.message.tone]}">
		<h1 class="text-2xl font-bold">{data.message.title}</h1>
		<p class="mt-4 text-lg leading-8">{data.message.text}</p>
		<p class="mt-6 text-sm text-gray-400">Μπορείτε να κλείσετε αυτή τη σελίδα και να επιστρέψετε στο Discord.</p>
	</div>
</section>
