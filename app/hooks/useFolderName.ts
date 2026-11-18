// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useTranslation } from "react-i18next";
import { Folders, getFolderDisplayName } from "shared/folders";

const SYSTEM_IDS: readonly string[] = Object.values(Folders);

/**
 * Localised folder label. System folders are translated by id (the stored DB
 * name stays English); custom folders show the name the user gave them.
 */
export function useFolderName() {
	const { t } = useTranslation();
	return (folderId: string, storedName?: string): string =>
		SYSTEM_IDS.includes(folderId.toLowerCase())
			? t(`folders.${folderId.toLowerCase()}`, { ns: "common" })
			: (storedName ?? getFolderDisplayName(folderId));
}
