.PHONY: install-plugin

prepare-plugin-for-installation:
	mkdir -p obsidian-todo
	cp manifest.json main.js styles.css obsidian-todo/
