import type { LucideIcon, LucideProps } from "lucide-react-native";
import * as React from "react";
import { withUniwind } from "uniwind";

import { TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type IconProps = LucideProps & {
	as: LucideIcon;
} & React.RefAttributes<LucideIcon>;

function IconImpl({ as: IconComponent, ...props }: IconProps) {
	return <IconComponent {...props} />;
}

const StyledIcon = withUniwind(IconImpl, {
	size: {
		fromClassName: "className",
		styleProperty: "width",
	},
	color: {
		fromClassName: "className",
		styleProperty: "color",
	},
});

function Icon({ as: IconComponent, className, ...props }: IconProps) {
	const textClass = React.useContext(TextClassContext);
	return (
		<StyledIcon
			as={IconComponent}
			className={cn("text-foreground size-5", textClass, className)}
			{...props}
		/>
	);
}

export { Icon };
