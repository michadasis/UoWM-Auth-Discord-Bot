<script>
	let { data, form } = $props();

	let stage = $derived(form?.stage ?? data.stage);
</script>

<svelte:head>
	<title>Επιβεβαίωση με email | Πληροφορική UoWM Discord</title>
</svelte:head>

<section class="mx-auto max-w-xl px-6 py-16 text-skin-base">
	<div class="rounded-lg bg-skin-accent p-8">
		<h1 class="text-2xl font-bold">Επιβεβαίωση με ιδρυματικό email</h1>

		{#if form?.error}
			<p class="mt-4 rounded border-l-4 border-[#ED4245] bg-skin-base p-3" role="alert">{form.error}</p>
		{/if}

		{#if stage === 'address'}
			<p class="mt-4 leading-7">
				Γράψτε το όνομα χρήστη του ιδρυματικού σας λογαριασμού (π.χ. <code>cs01234</code>). Θα
				λάβετε έναν εξαψήφιο κωδικό στο <code>@{data.domain}</code> email σας.
			</p>
			<p class="mt-2 text-sm text-gray-400">
				Δεν χρειάζεται και δεν πρέπει να γράψετε τον κωδικό πρόσβασής σας πουθενά.
			</p>
			<form method="POST" action="?/send" class="mt-6 flex flex-col gap-3">
				<label for="address" class="font-semibold">Όνομα χρήστη ή email</label>
				<input
					id="address"
					name="address"
					type="text"
					autocomplete="username"
					autocapitalize="none"
					spellcheck="false"
					required
					maxlength="80"
					placeholder="cs01234"
					class="rounded bg-skin-base p-3 text-skin-base outline-none ring-1 ring-gray-600 focus:ring-[#5865F2]"
				/>
				<button class="rounded-md bg-[#5865F2] px-4 py-3 font-semibold text-white hover:bg-[#4752c4]"
					>Αποστολή κωδικού</button
				>
			</form>
		{:else}
			<p class="mt-4 leading-7">
				Στείλαμε έναν εξαψήφιο κωδικό στο
				{#if form?.maskedAddress}<strong>{form.maskedAddress}</strong>{:else}ιδρυματικό σας email{/if}.
				Ελέγξτε και τον φάκελο ανεπιθύμητης αλληλογραφίας (Junk).
			</p>
			<form method="POST" action="?/verify" class="mt-6 flex flex-col gap-3">
				<label for="code" class="font-semibold">Κωδικός επιβεβαίωσης</label>
				<input
					id="code"
					name="code"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					pattern="[0-9 ]*"
					required
					maxlength="7"
					placeholder="123456"
					class="rounded bg-skin-base p-3 text-2xl tracking-widest text-skin-base outline-none ring-1 ring-gray-600 focus:ring-[#5865F2]"
				/>
				<button class="rounded-md bg-[#5865F2] px-4 py-3 font-semibold text-white hover:bg-[#4752c4]"
					>Επιβεβαίωση</button
				>
			</form>
			<form method="POST" action="?/send" class="mt-6 text-sm text-gray-400">
				<p>Δεν λάβατε κωδικό ή γράψατε λάθος διεύθυνση;</p>
				<div class="mt-2 flex gap-2">
					<input
						name="address"
						type="text"
						autocapitalize="none"
						spellcheck="false"
						required
						maxlength="80"
						placeholder="cs01234"
						class="flex-grow rounded bg-skin-base p-2 text-skin-base outline-none ring-1 ring-gray-600"
					/>
					<button class="rounded-md bg-gray-600 px-3 py-2 text-white hover:bg-gray-500">Νέος κωδικός</button>
				</div>
			</form>
		{/if}
	</div>
</section>
